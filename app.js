'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const KEY = 'ipurchase_v2', LEGACY = 'ipurchase_data';
  const empty = () => ({version: 2, transactions: [], expenses: []});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP'}).format(n / 100);
  const pounds = n => (n / 100).toFixed(2);
  const pence = value => {
    const s = String(value).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(s)) throw Error('Enter non-negative amounts with at most two decimal places.');
    const [whole, fraction = ''] = s.split('.');
    const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(n) || n > 100000000000) throw Error('Amount is too large.');
    return n;
  };
  const oldMoney = n => Math.round((Number(n) || 0) * 100);
  const id = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const localDate = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0,10); };
  const today = () => localDate(new Date());
  const received = a => (a.refunds || []).reduce((s,r) => s + r.amount, 0);
  const outstanding = a => a.expected - received(a);
  const line = (label, value, cls = '') => `<div class="rowline ${cls}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  const metric = (label, value) => `<div class="metric"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
  const status = a => {
    if (a.status === 'Not refundable') return a.status;
    if (outstanding(a) < 0) return 'Refund issue or discrepancy';
    if (a.expected > 0 && outstanding(a) === 0) return 'Fully refunded';
    if (received(a) > 0) return 'Partially refunded';
    return a.status || 'Not yet returned';
  };
  function migrate(old) {
    if (!old || !Array.isArray(old.transactions) || !Array.isArray(old.expenses)) throw Error('Invalid legacy backup.');
    return {version:2, transactions:old.transactions.map(t => ({
      id:String(t.id || id()), date:t.date, phones:[{model:String(t.model || 'Unknown'),colour:'',storage:'',qty:Number(t.qty)||1, total:oldMoney(t.phoneTotal)}],
      accessories:oldMoney(t.accessories) || oldMoney(t.refundExpected) ? [{id:id(),name:'Legacy accessories (combined)',qty:1,total:oldMoney(t.accessories),expected:oldMoney(t.refundExpected),status:'Awaiting return',refunds:(t.refunds||[]).map(r=>({amount:oldMoney(r.amount),date:r.date}))}] : [],
      sources:oldMoney(t.apple) ? [{face:oldMoney(t.apple),rate:null,cost:null}] : [], cash:oldMoney(t.cash),debit:oldMoney(t.card),credit:0,
      extra:oldMoney(t.nonref),commission:oldMoney(t.commission),commissionReceived:oldMoney(t.commissionReceived),purchaseExpense:0,
      total:oldMoney(t.total), exception:oldMoney(t.total)!==oldMoney(t.apple)+oldMoney(t.cash)+oldMoney(t.card),
      invoice:{ref:String(t.ref||''),verification:'Awaiting verification'}, notes:String(t.notes||''), duration:null, legacy:t
    })), expenses:old.expenses.map(e=>({id:String(e.id||id()),date:e.date,description:String(e.name||''),category:'Legacy',amount:oldMoney(e.amount),transaction:''}))};
  }
  function validateData(d) {
    if (!d || d.version !== 2 || !Array.isArray(d.transactions) || !Array.isArray(d.expenses)) throw Error('Unsupported or invalid backup format.');
    const amount = n => Number.isSafeInteger(n) && n >= 0;
    if (d.cashCount && (!amount(d.cashCount.amount) || typeof d.cashCount.date !== 'string' || isNaN(Date.parse(d.cashCount.date)))) throw Error('Invalid cash count in backup.');
    const ids = new Set();
    for (const t of d.transactions) {
      if (!t || typeof t.id !== 'string' || ids.has(t.id) || typeof t.date !== 'string' || isNaN(Date.parse(t.date)) || !Array.isArray(t.phones) || !Array.isArray(t.accessories) || !Array.isArray(t.sources) || !t.invoice || typeof t.invoice !== 'object' ||
          ![t.total,t.cash,t.debit,t.credit,t.extra,t.commission,t.commissionReceived,t.purchaseExpense].every(amount) || t.commissionReceived > t.commission ||
          (t.invoice.file && (typeof t.invoice.file !== 'string' || !/^data:(?:image\/[a-z0-9.+-]+|application\/pdf);base64,[a-z0-9+/=]+$/i.test(t.invoice.file)))) throw Error('Invalid transaction in backup.');
      ids.add(t.id);
      if (t.phones.some(p => !p || typeof p.model !== 'string' || !Number.isSafeInteger(p.qty) || p.qty < 1 || !amount(p.total)) ||
          t.sources.some(s => !s || !amount(s.face) || (s.cost !== null && !amount(s.cost))) ||
          t.accessories.some(a => !a || typeof a.id !== 'string' || typeof a.name !== 'string' || !Number.isSafeInteger(a.qty) || a.qty < 1 || !amount(a.total) || !amount(a.expected) || !Array.isArray(a.refunds) || a.refunds.some(r => !r || !amount(r.amount) || typeof r.date !== 'string'))) throw Error('Invalid transaction details in backup.');
    }
    if (d.expenses.some(e => !e || !amount(e.amount) || typeof e.date !== 'string' || typeof e.description !== 'string')) throw Error('Invalid expense in backup.');
    return d;
  }
  let data, blocked = false;
  try {
    const saved = localStorage.getItem(KEY), legacy = localStorage.getItem(LEGACY);
    data = saved ? validateData(JSON.parse(saved)) : legacy ? validateData(migrate(JSON.parse(legacy))) : empty();
    if (!saved && legacy) localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    data = empty(); blocked = true;
    $('notice').textContent = 'Records could not be loaded or migrated. Nothing has been overwritten. Restore a backup or use the original Index.html. ' + e.message;
  }
  function save(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); data = next; blocked = false; return true; }
    catch(e) { $('notice').textContent = 'Could not save records. Storage may be full or unavailable. Your change was not saved; export a backup. ' + e.message; return false; }
  }
  const change = fn => { if (blocked) { alert('Restore a backup before making changes.'); return false; } const next = structuredCopy(data); fn(next); if (!save(next)) return false; render(); return true; };
  const structuredCopy = d => JSON.parse(JSON.stringify(d));
  function switchTab(tab) {
    document.querySelectorAll('main section').forEach(s => s.hidden = s.id !== tab);
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    window.scrollTo(0,0);
  }
  document.querySelector('nav').addEventListener('click', e => { const b=e.target.closest('button[data-tab]'); if(b) switchTab(b.dataset.tab); });
  const phoneTemplate = () => `<div class="item"><div class="compact-row"><label>iPhone model<input class="model" list="models" required placeholder="Model"></label><label>Unit price (£)<input class="price" type="number" min="0" step="0.01" required></label><button type="button" class="secondary danger remove" aria-label="Remove iPhone">×</button></div><details><summary>Quantity, colour and storage</summary><div class="fields"><label>Quantity<input class="qty" type="number" min="1" step="1" value="1" required></label><label>Colour<input class="colour"></label><label>Storage<input class="storage" placeholder="256 GB"></label></div></details><div class="lineTotal hint"></div></div>`;
  const accessoryTemplate = () => `<div class="item"><div class="compact-row"><label>Accessory<input class="name" required placeholder="Product"></label><label>Unit price (£)<input class="price" type="number" min="0" step="0.01" required></label><button type="button" class="secondary danger remove" aria-label="Remove accessory">×</button></div><details><summary>Quantity and refund details</summary><div class="fields"><label>Quantity<input class="qty" type="number" min="1" step="1" value="1" required></label><label>Expected refund (£)<input class="expected" type="number" min="0" step="0.01" value="0" required></label><label>Return status<select class="status"><option>Not yet returned</option><option>Awaiting return</option><option>Not refundable</option></select></label></div></details><div class="lineTotal hint"></div></div>`;
  const sourceTemplate = () => `<div class="item"><div class="compact-row"><label>Apple ID balance (£)<input class="face" type="number" min="0" step="0.01" value="0" required></label><label>Acquisition rate (%)<input class="rate" type="number" min="0" max="100" step="0.01" value="85"></label><button type="button" class="secondary danger remove" aria-label="Remove balance">×</button></div><div class="lineTotal hint"></div></div>`;
  $('phones').insertAdjacentHTML('beforebegin','<datalist id="models"><option value="iPhone 18 Pro"><option value="iPhone 18 Pro Max"><option value="iPhone 18"><option value="iPhone Air"></datalist>');
  const add = (container, template) => { $(container).insertAdjacentHTML('beforeend',template()); updatePlanner(); };
  $('addPhone').onclick=()=>add('phones',phoneTemplate);
  $('addAccessory').onclick=()=>add('accessories',accessoryTemplate);
  $('addSource').onclick=()=>add('sources',sourceTemplate);
  $('purchaseForm').addEventListener('click',e=>{ if(e.target.classList.contains('remove')) {e.target.closest('.item').remove(); updatePlanner();} });
  $('purchaseForm').addEventListener('input',e=>{
    const row=e.target.closest('#accessories .item');
    if(row) {
      if(e.target.classList.contains('expected')) row.dataset.refundEdited='yes';
      if(e.target.classList.contains('status') && e.target.value==='Not refundable') row.querySelector('.expected').value='0';
      else if(row.querySelector('.status').value!=='Not refundable' && !row.dataset.refundEdited && (e.target.classList.contains('price') || e.target.classList.contains('qty') || e.target.classList.contains('status'))) {
        try { const qty=Number(row.querySelector('.qty').value); if(Number.isSafeInteger(qty)&&qty>0) row.querySelector('.expected').value=pounds(pence(row.querySelector('.price').value)*qty); } catch(err) {}
      }
    }
    updatePlanner();
  });
  function readPlanner() {
    const q = (el, cls) => el.querySelector('.'+cls).value.trim();
    const rows = id => [...$(id).querySelectorAll('.item')];
    const quantity = value => { const n=Number(value); if(!Number.isSafeInteger(n)||n<1||n>10000) throw Error('Quantity must be a whole number from 1 to 10,000.'); return n; };
    const phones=rows('phones').map(el=>{ const qty=quantity(q(el,'qty')), unit=pence(q(el,'price')); return {model:q(el,'model'),colour:q(el,'colour'),storage:q(el,'storage'),qty,unit,total:qty*unit}; });
    const accessories=rows('accessories').map(el=>{ const qty=quantity(q(el,'qty')),unit=pence(q(el,'price')),expected=pence(q(el,'expected')); return {id:id(),name:q(el,'name'),qty,unit,total:qty*unit,expected,status:q(el,'status'),refunds:[]}; });
    const sources=rows('sources').map(el=>{const face=pence(q(el,'face')), r=q(el,'rate'); let rate=null,cost=null; if(r!==''){ if(!/^\d+(?:\.\d{1,2})?$/.test(r)||Number(r)>100) throw Error('Acquisition rate must be between 0 and 100%.'); rate=Math.round(Number(r)*100); cost=Math.round(face*rate/10000); } return {face,rate,cost}; });
    return {phones,accessories,sources,cash:pence($('cash').value),debit:pence($('debit').value),credit:pence($('credit').value),extra:pence($('extra').value),commission:pence($('commission').value),commissionReceived:pence($('commissionReceived').value),purchaseExpense:pence($('purchaseExpense').value)};
  }
  const sum = (arr,fn) => arr.reduce((s,x)=>s+fn(x),0);
  function figures(t) {
    const phone=sum(t.phones,p=>p.total), accessory=sum(t.accessories,a=>a.total), face=sum(t.sources,s=>s.face);
    const unknown=t.sources.some(s=>s.cost===null && s.face>0), cost=sum(t.sources,s=>s.cost||0), saving=face-cost;
    const refunds=sum(t.accessories,a=>a.expected), payments=face+t.cash+t.debit+t.credit, total=phone+accessory;
    return {phone,accessory,face,unknown,cost,saving,refunds,payments,total,profit:saving+t.extra+t.commission-t.purchaseExpense, outflow:cost+t.cash+t.debit+t.credit-refunds};
  }
  function updatePlanner() {
    const rows = id => [...$(id).querySelectorAll('.item')];
    const safeAmount = value => { try { return value === '' ? 0 : pence(value); } catch(e) { return 0; } };
    const itemTotal = id => sum(rows(id),el=>{const qty=Number(el.querySelector('.qty').value);return Number.isSafeInteger(qty)&&qty>0&&qty<=10000 ? safeAmount(el.querySelector('.price').value)*qty : 0;});
    const phone=itemTotal('phones'), accessory=itemTotal('accessories'), face=sum(rows('sources'),el=>safeAmount(el.querySelector('.face').value));
    const auto=$('autoPayment').value;
    ['cash','debit','credit'].forEach(key=>$(key).readOnly=key===auto);
    if(auto) {
      const other=sum(['cash','debit','credit'].filter(key=>key!==auto),key=>safeAmount($(key).value));
      $(auto).value=pounds(Math.max(0,phone+accessory-face-other));
    }
    $('plannerTotals').innerHTML=metric('iPhones',money(phone))+metric('Accessories',money(accessory))+metric('Total',money(phone+accessory))+metric('Apple ID',money(face))+metric('Cash',money(safeAmount($('cash').value)))+metric('Card',money(safeAmount($('debit').value)+safeAmount($('credit').value)));
    try {
      const t=readPlanner(), f=figures(t);
      $('breakdown').innerHTML=line('iPhones',money(f.phone))+line('Accessories',money(f.accessory))+line('Invoice total',money(f.total))+line('Apple Account face value',money(f.face))+line('Cash',money(t.cash))+line('Card payments',money(t.debit+t.credit))+line('Total payments',money(f.payments))+line('Invoice less payments',money(f.total-f.payments),f.total!==f.payments?'warning':'good')+line('Acquisition cost',f.unknown?'Incomplete — unknown cost':money(f.cost))+line('Acquisition savings',f.unknown?'Incomplete — unknown cost':money(f.saving))+line('Extra non-refundable amount',money(t.extra))+line('Commission earned / outstanding',money(t.commission)+' / '+money(t.commission-t.commissionReceived))+line('Transaction expenses',money(t.purchaseExpense))+line('Estimated profit',f.unknown?'Incomplete — unknown cost':money(f.profit))+line('Expected accessory refunds',money(f.refunds))+line('Expected net outflow',f.unknown?'Incomplete — unknown cost':money(f.outflow));
      const source=t.sources[0];
      const rates=[80,85,90,95,100];if(source&&source.rate!==null&&!rates.includes(source.rate/100))rates.push(source.rate/100);rates.sort((a,b)=>a-b);
      $('comparison').innerHTML=source ? '<h4>Rate comparison for first source</h4>'+rates.map(r=>line(r+'%'+(source.rate===r*100?' (selected)':''),money(Math.round(source.face*r/100))+' cost · '+money(source.face-Math.round(source.face*r/100))+' saving'+(source.cost!==null?' · '+money((source.face-Math.round(source.face*r/100))-(source.face-source.cost))+' vs selected':''))).join(''):'';
      [...$('phones').querySelectorAll('.item')].forEach((el,i)=>el.querySelector('.lineTotal').textContent='Line total: '+money(t.phones[i].total));
      [...$('accessories').querySelectorAll('.item')].forEach((el,i)=>el.querySelector('.lineTotal').textContent='Line total: '+money(t.accessories[i].total));
      [...$('sources').querySelectorAll('.item')].forEach((el,i)=>{const s=t.sources[i];el.querySelector('.lineTotal').textContent=s.cost===null?'Acquisition cost and savings unknown':'Cost: '+money(s.cost)+' · Savings: '+money(s.face-s.cost);});
    } catch(e) { $('comparison').innerHTML=''; $('breakdown').textContent='Complete all amounts to see the breakdown. '+e.message; }
  }
  const duration=s=>[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');
  function makeTimer(display,start,stop,reset) {
    let started=null,elapsed=0,interval=null;
    const seconds=()=>Math.floor((elapsed+(started!==null ? Date.now()-started : 0))/1000);
    const draw=()=>{$(display).textContent=duration(seconds());};
    $(start).onclick=()=>{if(started===null){started=Date.now();interval=setInterval(draw,500);draw();}};
    $(stop).onclick=()=>{if(started!==null){elapsed+=Date.now()-started;started=null;clearInterval(interval);}draw();};
    $(reset).onclick=()=>{started=null;elapsed=0;clearInterval(interval);draw();};
    return seconds;
  }
  const seconds=makeTimer('timer','startTimer','stopTimer','resetTimer');
  makeTimer('otherTimer','startOtherTimer','stopOtherTimer','resetOtherTimer');
  const setPurchaseTime=()=>{const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());$('purchaseTime').value=now.toISOString().slice(0,16);};
  setPurchaseTime();
  let completedId=null;
  $('purchaseForm').onsubmit=e=>{
    e.preventDefault();
    try {
      const t=readPlanner(), f=figures(t);
      if(!t.phones.length || t.phones.some(p=>!p.model)) throw Error('Add at least one iPhone with a model.');
      if(t.accessories.some(a=>!a.name||a.expected>a.total||(a.status==='Not refundable'&&a.expected!==0))) throw Error('Check accessory names and expected refunds; non-refundable items must have a zero expected refund.');
      if(t.commissionReceived>t.commission) throw Error('Commission received cannot exceed commission earned.');
      if(f.total!==f.payments && !$('exception').checked) throw Error('Payments do not reconcile. Correct them or explicitly record an exception.');
      if(!confirm(`Complete purchase?\nInvoice: ${money(f.total)}\nPayments: ${money(f.payments)}\nDifference: ${money(f.total-f.payments)}\nEstimated profit: ${f.unknown?'Incomplete':money(f.profit)}${f.total!==f.payments?'\nPayment exception will be recorded.':''}`)) return;
      const purchaseDate=new Date($('purchaseTime').value);if(isNaN(purchaseDate.getTime())) throw Error('Enter a valid purchase time.');
      Object.assign(t,{id:id(),date:purchaseDate.toISOString(),recordedAt:new Date().toISOString(),total:f.total,exception:f.total!==f.payments,invoice:{ref:'',verification:'Awaiting verification'},duration:seconds()});
      if(!change(d=>d.transactions.push(t))) return;
      completedId=t.id; $('completionMessage').textContent='Done with '+money(t.extra); $('completion').showModal();
      e.target.reset(); setPurchaseTime(); $('phones').innerHTML='';$('accessories').innerHTML='';$('sources').innerHTML='';add('phones',phoneTemplate);add('sources',sourceTemplate);$('resetTimer').click(); updatePlanner();
    } catch(err){alert(err.message);}
  };
  async function copyText(text) {
    try { if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(text);return true;} } catch(e) {}
    const el=document.createElement('textarea'); el.value=text;el.setAttribute('readonly','');el.style.position='fixed';el.style.left='-9999px';document.body.appendChild(el);el.select();el.setSelectionRange(0,el.value.length);
    let ok=false;try{ok=document.execCommand('copy');}catch(e){}el.remove();return ok;
  }
  $('copyMessage').onclick=async()=>{const text=$('completionMessage').textContent;if(await copyText(text)) alert('Message copied.');else prompt('Copy this message:',text);};
  $('closeCompletion').onclick=()=>$('completion').close();
  $('scanNew').onclick=()=>{$('completion').close();openInvoice(completedId);};
  $('expenseDate').value=today();
  $('expenseForm').onsubmit=e=>{e.preventDefault();try{const amount=pence($('expenseAmount').value),ref=$('expenseTransaction').value.trim();if(!amount)throw Error('Enter a positive expense.');if(ref&&!data.transactions.some(t=>t.id===ref))throw Error('Transaction reference not found.');const expense={id:id(),date:$('expenseDate').value,description:$('expenseDescription').value.trim(),category:$('expenseCategory').value.trim(),amount,transaction:ref};if(!expense.description||!expense.category)throw Error('Enter description and category.');if(change(d=>d.expenses.push(expense))){e.target.reset();$('expenseDate').value=today();}}catch(err){alert(err.message);}};
  const action=(name,tid,label,extra='')=>`<button class="secondary" data-action="${name}" data-id="${esc(tid)}" ${extra}>${esc(label)}</button>`;
  const linkedExpenses = t => sum(data.expenses.filter(e=>e.transaction===t.id),e=>e.amount);
  function transactionHtml(t) {
    const f=figures(t), refund=sum(t.accessories,received), linked=linkedExpenses(t);
    return `<article class="item record"><h3>${esc(t.phones.map(p=>p.model+' × '+p.qty).join(', '))}</h3><p class="hint">Reference: ${esc(t.id)}<br>${esc(new Date(t.date).toLocaleString('en-GB'))} · ${esc(t.invoice.verification || 'Awaiting verification')}${t.exception?' · ⚠️ Payment exception':''}</p>
    ${t.phones.map(p=>line(p.model+' · '+p.colour+' · '+p.storage+' × '+p.qty,money(p.total))).join('')}
    ${line('Invoice total',money(t.total))}${line('Apple Account / cash / cards',money(f.face)+' / '+money(t.cash)+' / '+money(t.debit+t.credit))}${line('Expected / received refunds',money(f.refunds)+' / '+money(refund))}${line('Extra non-refundable amount',money(t.extra))}${line('Commission earned / received',money(t.commission)+' / '+money(t.commissionReceived))}${line('Estimated profit',f.unknown?'Incomplete — unknown acquisition cost':money(f.profit-linked))}${line('Actual profit','Unavailable — receipts not fully confirmed')}
    <div class="actions">${action('invoice',t.id,'Verify / attach invoice')}${t.invoice.file?action('viewInvoice',t.id,'View attachment'):''}${action('edit',t.id,'Edit earnings / balance costs')}${action('copy',t.id,'Copy message')}${t.commissionReceived<t.commission?action('commission',t.id,'Record commission received'):''}${action('delete',t.id,'Delete')}</div></article>`;
  }
  function renderTransactions() {
    const ts=data.transactions, td=today(), todays=ts.filter(t=>localDate(t.date)===td);
    $('transactionStats').innerHTML=metric('iPhones today',String(sum(todays,t=>sum(t.phones,p=>p.qty))))+metric('Lifetime iPhones',String(sum(ts,t=>sum(t.phones,p=>p.qty))))+metric('Purchase value today',money(sum(todays,t=>t.total)))+metric('Lifetime purchase value',money(sum(ts,t=>t.total)));
    const search=$('search').value.toLowerCase(),date=$('filterDate').value,model=$('filterModel').value.toLowerCase(),refund=$('filterRefund').value,verification=$('filterVerification').value;
    const filtered=ts.filter(t=>(!search||(t.id+' '+t.phones.map(p=>p.model).join(' ')+' '+(t.invoice.ref||'')).toLowerCase().includes(search))&&(!date||localDate(t.date)===date)&&(!model||t.phones.some(p=>p.model.toLowerCase().includes(model)))&&(!refund||t.accessories.some(a=>status(a)===refund))&&(!verification||(t.invoice.verification||'Awaiting verification')===verification));
    $('transactionList').innerHTML=filtered.length?[...filtered].reverse().map(transactionHtml).join(''):'<p class="hint">No matching transactions.</p>';
  }
  function renderRefunds() {
    const all=data.transactions.flatMap(t=>t.accessories.map(a=>({t,a})));
    $('refundStats').innerHTML=metric('Expected refunds',money(sum(all,x=>x.a.expected)))+metric('Actually received',money(sum(all,x=>received(x.a))))+metric('Outstanding',money(sum(all,x=>outstanding(x.a))));
    const groups=['Not yet returned','Awaiting return','Returned, refund pending','Partially refunded','Fully refunded','Not refundable','Refund issue or discrepancy'];
    $('refundList').innerHTML=groups.map(group=>{
      const entries=all.filter(x=>status(x.a)===group);
      if(!entries.length)return '';
      return `<div class="card"><h3>${esc(group)}</h3>${entries.map(({t,a})=>`<div class="item record"><strong>${esc(a.name)} × ${a.qty}</strong><p class="hint">Transaction ${esc(t.id)}<br>Return date: ${esc(a.returnDate||'Not recorded')}<br>Refund payments: ${a.refunds.length?esc(a.refunds.map(r=>money(r.amount)+' on '+new Date(r.date).toLocaleDateString('en-GB')).join(', ')):'None received'}</p>${line('Expected',money(a.expected))}${line('Received',money(received(a)))}${line('Outstanding',money(outstanding(a)))}<div class="actions">${a.expected>0&&outstanding(a)>0?action('refund',t.id,'Record refund',`data-accessory="${esc(a.id)}"`):''}${a.status!=='Not refundable'&&status(a)!=='Fully refunded'?action('returned',t.id,'Mark returned',`data-accessory="${esc(a.id)}"`):''}</div></div>`).join('')}</div>`;
    }).join('')||'<div class="card"><p class="hint">No accessories recorded.</p></div>';
  }
  function renderReports() {
    const ts=data.transactions, allSources=ts.flatMap(t=>t.sources), face=sum(allSources,s=>s.face), known=allSources.filter(s=>s.cost!==null), unknown=allSources.some(s=>s.face>0&&s.cost===null), cost=sum(known,s=>s.cost), knownFace=sum(known,s=>s.face);
    const commission=sum(ts,t=>t.commission), commReceived=sum(ts,t=>t.commissionReceived), extra=sum(ts,t=>t.extra), expenses=sum(data.expenses,e=>e.amount)+sum(ts,t=>t.purchaseExpense);
    const d=today(), now=new Date(), week=new Date(now);week.setDate(now.getDate()-((now.getDay()+6)%7)); const weekStart=localDate(week), month=d.slice(0,7);
    function profitFor(test) {
      const tx=ts.filter(t=>test(localDate(t.date))), ex=data.expenses.filter(e=>test(e.date));
      if(tx.some(t=>figures(t).unknown))return 'Incomplete';
      return money(sum(tx,t=>figures(t).profit)-sum(ex,e=>e.amount));
    }
    const dayCommission=sum(ts.filter(t=>localDate(t.date)===d),t=>t.commission);
    const dayExpenses=sum(data.expenses.filter(e=>e.date===d),e=>e.amount)+sum(ts.filter(t=>localDate(t.date)===d),t=>t.purchaseExpense);
    $('reportStats').innerHTML=metric('Commission earned',money(commission))+metric('Commission received',money(commReceived))+metric('Commission outstanding',money(commission-commReceived))+metric('Extra amounts today',money(sum(ts.filter(t=>localDate(t.date)===d),t=>t.extra)))+metric('Extra amounts recorded',money(extra))+metric('Apple Account face value',money(face))+metric('Known acquisition cost',money(cost)+(unknown?' + unknown':''))+metric('Known savings',money(knownFace-cost)+(unknown?' + unknown':''))+metric('Average known acquisition rate',knownFace?(cost/knownFace*100).toFixed(2)+'%':'Unavailable')+metric('Total expenses',money(expenses))+metric('Daily net earnings (commission − expenses)',money(dayCommission-dayExpenses))+metric('Daily estimated profit',profitFor(x=>x===d))+metric('Weekly estimated profit',profitFor(x=>x>=weekStart&&x<=d))+metric('Monthly estimated profit',profitFor(x=>x.slice(0,7)===month))+metric('Lifetime estimated profit',profitFor(()=>true))+metric('Confirmed actual profit','Unavailable');
    $('expenseList').innerHTML=data.expenses.length?'<h3>Recorded expenses</h3>'+[...data.expenses].reverse().map(e=>`<div class="item">${esc(e.date)} · ${esc(e.description)} · ${esc(e.category||'')} · ${money(e.amount)}${e.transaction?' · '+esc(e.transaction):''}<div class="actions">${action('deleteExpense',e.id,'Delete expense')}</div></div>`).join(''):'';
    const durations=ts.map(t=>t.duration).filter(n=>Number.isFinite(n));
    $('timerStats').textContent=durations.length?'Last: '+duration(durations[durations.length-1])+(durations.length>1?' · Average: '+duration(Math.round(sum(durations,x=>x)/durations.length)):''):'No purchase sessions recorded yet.';
  }
  function renderDay() {
    const ts=data.transactions, day=today(), count=data.cashCount;
    const phones=sum(ts.filter(t=>localDate(t.date)===day),t=>sum(t.phones,p=>p.qty));
    const accessories=ts.flatMap(t=>t.accessories.map(a=>({t,a})));
    const inHand=sum(accessories.filter(({a})=>a.status!=='Returned, refund pending' && status(a)!=='Fully refunded'),x=>x.a.qty);
    let cash='Not counted today';
    if(count && localDate(count.date)===day) {
      const after=date=>typeof date==='string' && !isNaN(Date.parse(date)) && Date.parse(date)>=Date.parse(count.date);
      const spent=sum(ts.filter(t=>after(t.recordedAt)),t=>t.cash);
      const returned=sum(accessories,x=>sum(x.a.refunds.filter(r=>r.method==='cash' && after(r.date)),r=>r.amount));
      cash=money(count.amount-spent+returned);
    }
    $('dayStats').innerHTML=metric('iPhones purchased today',String(phones))+metric('Accessories in hand',String(inHand))+metric('Cash in hand',cash);
    const select=$('refundAccessory'), selected=select.value;
    const eligible=accessories.filter(({a})=>a.status!=='Not refundable' && outstanding(a)>0);
    select.innerHTML='<option value="">Select an accessory</option>'+eligible.map(({t,a})=>`<option value="${esc(JSON.stringify([t.id,a.id]))}">${esc(a.name)} × ${a.qty} · ${esc(money(outstanding(a)))} · ${esc(new Date(t.date).toLocaleDateString('en-GB'))}</option>`).join('');
    select.value=[...select.options].some(o=>o.value===selected)?selected:'';
  }
  $('saveOpening').onclick=()=>{
    try {
      const amount=pence($('openingCash').value);
      if(data.cashCount && localDate(data.cashCount.date)===today() && !confirm('Replace today’s count with the cash you have counted now? Earlier movements will no longer be included.')) return;
      if(change(d=>{d.cashCount={amount,date:new Date().toISOString()};})) $('openingCash').value='';
    } catch(err){alert(err.message);}
  };
  $('completeRefund').onclick=()=>{
    const selected=$('refundAccessory').value;
    if(!selected){alert('Select an accessory to refund.');return;}
    const [tid,aid]=JSON.parse(selected), t=data.transactions.find(x=>x.id===tid), a=t&&t.accessories.find(x=>x.id===aid);
    if(!a || a.status==='Not refundable' || outstanding(a)<=0){alert('This refund is no longer available.');renderDay();return;}
    const amount=outstanding(a);
    if(!confirm('Record '+money(amount)+' received in cash and mark '+a.name+' returned?')) return;
    change(d=>{const item=d.transactions.find(x=>x.id===tid).accessories.find(x=>x.id===aid);item.status='Returned, refund pending';item.returnDate=today();item.refunds.push({amount,date:new Date().toISOString(),method:'cash'});});
  };
  function render(){renderTransactions();renderRefunds();renderReports();renderDay();}
  ['search','filterDate','filterModel','filterRefund','filterVerification'].forEach(x=>$(x).addEventListener('input',renderTransactions));
  document.addEventListener('click',e=>{
    const b=e.target.closest('button[data-action]');if(!b)return;
    const tid=b.dataset.id,t=data.transactions.find(x=>x.id===tid), a=t&&t.accessories.find(x=>x.id===b.dataset.accessory);
    if(b.dataset.action==='delete'){if(confirm('Delete this transaction and its refund history?'))change(d=>{d.transactions=d.transactions.filter(x=>x.id!==tid);});}
    if(b.dataset.action==='deleteExpense'){if(confirm('Delete this expense?'))change(d=>{d.expenses=d.expenses.filter(x=>x.id!==tid);});}
    if(b.dataset.action==='copy'&&t){const text='Done with '+money(t.extra);copyText(text).then(ok=>{if(ok)alert('Message copied.');else prompt('Copy this message:',text);});}
    if(b.dataset.action==='edit'&&t){
      try{
        const sources=structuredCopy(t.sources);
        for(const s of sources){const rate=prompt('Acquisition rate (%) for '+money(s.face)+' face value. Leave blank if unknown.',s.rate===null?'':String(s.rate/100));if(rate===null)return;if(rate.trim()===''){s.rate=null;s.cost=null;}else{if(!/^\d+(?:\.\d{1,2})?$/.test(rate.trim())||Number(rate)>100)throw Error('Rate must be between 0 and 100%.');s.rate=Math.round(Number(rate)*100);s.cost=Math.round(s.face*s.rate/10000);}}
        const extra=prompt('Extra non-refundable amount (£)',pounds(t.extra));if(extra===null)return;
        const commission=prompt('Commission earned (£)',pounds(t.commission));if(commission===null)return;
        const expense=prompt('Transaction expense (£)',pounds(t.purchaseExpense));if(expense===null)return;
        const newExtra=pence(extra),newCommission=pence(commission),newExpense=pence(expense);
        if(newCommission<t.commissionReceived)throw Error('Commission earned cannot be less than commission already received.');
        if(confirm('Save these changes?'))change(d=>{const x=d.transactions.find(y=>y.id===tid);x.sources=sources;x.extra=newExtra;x.commission=newCommission;x.purchaseExpense=newExpense;});
      }catch(err){alert(err.message);}
    }
    if(b.dataset.action==='commission'&&t){
      const v=prompt('Commission received now (£), outstanding '+money(t.commission-t.commissionReceived));if(v===null)return;
      try{const n=pence(v);if(n<=0||n>t.commission-t.commissionReceived)throw Error('Enter a positive amount no greater than the outstanding commission.');change(d=>{d.transactions.find(x=>x.id===tid).commissionReceived+=n;});}catch(err){alert(err.message);}
    }
    if(b.dataset.action==='refund'&&a){
      const v=prompt('Refund actually received (£), outstanding '+money(outstanding(a)));if(v===null)return;
      try{const n=pence(v);if(n<=0||n>outstanding(a))throw Error('Enter a positive amount no greater than the outstanding refund.');change(d=>{d.transactions.find(x=>x.id===tid).accessories.find(x=>x.id===a.id).refunds.push({amount:n,date:new Date().toISOString()});});}catch(err){alert(err.message);}
    }
    if(b.dataset.action==='returned'&&a){const date=prompt('Return date (YYYY-MM-DD)',today());if(date===null)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date))){alert('Enter a valid date.');return;}change(d=>{const x=d.transactions.find(x=>x.id===tid).accessories.find(x=>x.id===a.id);x.returnDate=date;x.status='Returned, refund pending';});}
    if(b.dataset.action==='invoice'&&t)openInvoice(tid);
    if(b.dataset.action==='viewInvoice'&&t&&t.invoice.file){const link=document.createElement('a');link.href=t.invoice.file;link.download=t.invoice.fileName||'invoice';link.click();}
  });
  function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('exportJson').onclick=()=>download('iphone-purchase-backup-'+today()+'.json',JSON.stringify(data,null,2),'application/json');
  $('exportCsv').onclick=()=>{
    const csvCell=x=>'"'+String(x??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
    const rows=[['Reference','Date','Models','Quantity','Invoice GBP','Apple Account GBP','Cash GBP','Debit GBP','Credit GBP','Expected refunds GBP','Received refunds GBP','Extra GBP','Commission earned GBP','Commission received GBP','Verification']];
    data.transactions.forEach(t=>rows.push([t.id,t.date,t.phones.map(p=>p.model+' '+p.colour+' '+p.storage).join('; '),sum(t.phones,p=>p.qty),pounds(t.total),pounds(sum(t.sources,s=>s.face)),pounds(t.cash),pounds(t.debit),pounds(t.credit),pounds(sum(t.accessories,a=>a.expected)),pounds(sum(t.accessories,received)),pounds(t.extra),pounds(t.commission),pounds(t.commissionReceived),t.invoice.verification]));
    download('iphone-purchase-transactions-'+today()+'.csv',rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  };
  $('importJson').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try {const raw=JSON.parse(await file.text()),next=validateData(raw.version===2?raw:migrate(raw));if(confirm('Replace current records with this backup? Export your current backup first.')){if(save(next)){ $('notice').textContent='Backup restored.';render();}}}catch(err){alert('Backup not restored: '+err.message);}finally{e.target.value='';}
  };
  let invoiceId=null, invoiceFile=null;
  function openInvoice(tid){
    const t=data.transactions.find(x=>x.id===tid);if(!t)return;
    invoiceId=tid;invoiceFile=null;$('invoiceFile').value='';$('scanRef').value=t.invoice.ref||'';$('scanTotal').value=t.invoice.total==null?'':pounds(t.invoice.total);$('scanText').value=t.invoice.text||'';$('productsVerified').checked=!!t.invoice.productsVerified;$('ocrStatus').textContent='Select an invoice or enter the details manually.';invoiceCompare();$('invoiceDialog').showModal();
  }
  function invoiceCompare(){
    const t=data.transactions.find(x=>x.id===invoiceId);if(!t)return;
    let total;try{total=$('scanTotal').value===''?null:pence($('scanTotal').value);}catch(e){total=null;}
    const duplicate=$('scanRef').value.trim()&&data.transactions.some(x=>x.id!==invoiceId&&(x.invoice.ref||'').trim().toLowerCase()===$('scanRef').value.trim().toLowerCase());
    $('invoiceComparison').innerHTML=line('Planned total',money(t.total))+line('Scanned / entered total',total===null?'Not entered':money(total))+line('Difference',total===null?'Awaiting verification':money(total-t.total),total!==null&&total!==t.total?'warning':'')+(duplicate?'<p class="warning">⚠️ This invoice reference is already used by another transaction.</p>':'')+'<p class="hint">Product matching, quantities and line prices require manual checking against the original plan. Approval never changes the original plan.</p>';
  }
  $('scanRef').oninput=invoiceCompare;$('scanTotal').oninput=invoiceCompare;
  $('invoiceFile').onchange=e=>{invoiceFile=e.target.files[0]||null;$('ocrStatus').textContent=invoiceFile?'File selected: '+invoiceFile.name:'No invoice selected.';};
  $('closeInvoice').onclick=()=>$('invoiceDialog').close();
  $('scanCodes').onclick=async()=>{
    if(!invoiceFile||!invoiceFile.type.startsWith('image/')){alert('Select an image to scan.');return;}
    if(!('BarcodeDetector' in window)){ $('ocrStatus').textContent='Barcode / QR detection is not supported by this browser. Check the code manually.';return; }
    let bitmap;
    try {bitmap=await createImageBitmap(invoiceFile);const codes=await new BarcodeDetector().detect(bitmap);$('ocrStatus').textContent=codes.length?'Code values (may be URLs or references, not invoice details): '+codes.map(c=>c.rawValue).join(' · '):'No barcode or QR code detected.';}catch(err){$('ocrStatus').textContent='Code scanning failed: '+err.message;}finally{if(bitmap)bitmap.close();}
  };
  $('runOcr').onclick=async()=>{
    if(!invoiceFile||!invoiceFile.type.startsWith('image/')){alert('Select an image for OCR. PDF files can be attached and checked manually.');return;}
    if(!confirm('Download the OCR engine and language data from external servers? The selected image will be processed in this browser.'))return;
    $('runOcr').disabled=true;$('ocrStatus').textContent='Loading OCR software…';let worker;
    try {
      if(!window.Tesseract)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('Could not download OCR software.'));document.head.appendChild(s);});
      worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status)$('ocrStatus').textContent='OCR: '+m.status;}});
      const result=await worker.recognize(invoiceFile),text=result.data.text||'';$('scanText').value=text;
      const ref=text.match(/(?:invoice|order|document|receipt)\s*(?:no\.?|number|#|ref(?:erence)?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
      if(ref)$('scanRef').value=ref[1];
      const lines=text.split(/\r?\n/).filter(l=>/(grand total|total due|amount due|order total|invoice total|total)/i.test(l)&&!/(sub.?total|vat|tax total|total savings)/i.test(l));
      for(const l of lines){const match=l.match(/(?:£\s*)?(\d[\d,]*\.\d{2})\s*$/);if(match)$('scanTotal').value=match[1].replace(/,/g,'');}
      $('ocrStatus').textContent='OCR finished. Review and correct every field before approval.';invoiceCompare();
    }catch(err){$('ocrStatus').textContent='OCR failed: '+err.message;}finally{if(worker)await worker.terminate();$('runOcr').disabled=false;}
  };
  $('saveInvoice').onclick=async()=>{
    const t=data.transactions.find(x=>x.id===invoiceId);if(!t)return;
    try {
      const ref=$('scanRef').value.trim(),total=$('scanTotal').value===''?null:pence($('scanTotal').value);
      const duplicate=ref&&data.transactions.some(x=>x.id!==invoiceId&&(x.invoice.ref||'').trim().toLowerCase()===ref.toLowerCase());
      if(duplicate&&!confirm('This reference is already recorded. Attach it anyway?'))return;
      let file=t.invoice.file||null,fileName=t.invoice.fileName||'';
      if(invoiceFile){
        if(!invoiceFile.type.startsWith('image/')&&invoiceFile.type!=='application/pdf')throw Error('Select an image or PDF.');
        if(invoiceFile.size>1500000)throw Error('Attachment exceeds 1.5 MB. Use a smaller file to protect browser storage.');
        file=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read the file.'));reader.readAsDataURL(invoiceFile);});fileName=invoiceFile.name;
      }
      const productsVerified=$('productsVerified').checked;
      const verification=total===null?'Awaiting verification':total!==t.total?'Difference detected':productsVerified?'Match':'Awaiting verification';
      if(change(d=>{d.transactions.find(x=>x.id===invoiceId).invoice={ref,total,text:$('scanText').value,verification,productsVerified,file,fileName};})){$('invoiceDialog').close();$('notice').textContent='Invoice details approved. The original purchase plan was not changed.';}
    }catch(err){alert(err.message);}
  };
  add('phones',phoneTemplate);add('sources',sourceTemplate);render();
  window.addEventListener('focus',renderDay);
})();
