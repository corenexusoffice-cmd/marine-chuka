(function(){
  'use strict';
  var C=window.AF, $=function(id){return document.getElementById(id)};
  var fmt=function(n){return 'KES '+Number(n).toLocaleString('en-KE')};
  var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
  var skew=function(){return C.serverSkew||0};
  var now=function(){return Date.now()+skew()};
  var offerEnd=function(){return new Date(C.OFFER_ENDS).getTime()};
  var offerLive=function(){return now()<offerEnd()};
  var stock=function(id){return C.stock?C.stock[id]:undefined};

  function api(path,opts){
    return fetch(path,opts).then(function(r){return r.json().catch(function(){return {}}).then(function(j){ if(!r.ok) throw new Error(j.error||'Something went wrong. Please try again.'); return j; })},
      function(){ throw new Error('No connection. Check your internet and try again.'); });
  }
  function post(path,body){ return api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }

  /* ---------- render ---------- */
  var tks=$('tks'), grid=$('offers-grid');
  function renderCards(){
    tks.innerHTML=''; grid.innerHTML='';
    Object.keys(C.TIERS).forEach(function(k){
      var t=C.TIERS[k], li=t.perks.map(function(p){return '<li>'+p+'</li>'}).join('');
      var el=document.createElement('article'); el.className='tk '+k; el.id=k;
      el.innerHTML='<div class="sheen"></div><div class="top"><span class="badge">'+t.name+'</span><h3>'+t.tagline.toUpperCase().replace('. ','.<br>')+'</h3><ul>'+li+'</ul></div>'+
        '<div class="bot"><div class="price"><small>Per ticket</small>'+fmt(t.price)+'</div><button class="btn sm" type="button" data-tier="'+k+'">Select <span class="arr">→</span></button></div>';
      tks.appendChild(el);
    });
    var reg=C.TIERS.regular.price;
    C.OFFERS.forEach(function(o){
      var full=reg*o.people, save=full-o.price, each=Math.round(o.price/o.people);
      var el=document.createElement('article'); el.className='of'; el.id='of-'+o.id;
      el.innerHTML='<span class="who">'+o.people+' people · Regular</span><h3>'+o.name+'</h3>'+
        '<div class="p">'+fmt(o.price)+'<s>'+fmt(full)+'</s></div><div class="save">Save '+fmt(save)+'</div><div class="each">'+fmt(each)+' per person</div>'+
        '<div class="left" data-left="'+o.id+'"></div>'+
        '<button class="btn" type="button" data-offer="'+o.id+'">Get the '+o.name.toLowerCase()+' offer <span class="arr">→</span></button>';
      grid.appendChild(el);
    });
    $('stockRule').textContent='Limited to '+C.STOCK_PER_OFFER+' bundles for each offer. When they are gone, the offer closes even if the timer is still running.';
    $('offerEnds').textContent='Offer ends '+new Date(offerEnd()).toLocaleString('en-KE',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Nairobi'});
    renderStock();
  }
  function renderStock(){
    C.OFFERS.forEach(function(o){
      var lab=document.querySelector('[data-left="'+o.id+'"]'), btn=document.querySelector('[data-offer="'+o.id+'"]'); if(!lab) return;
      var rem=stock(o.id), live=offerLive(), out=(rem!==undefined&&rem<=0);
      lab.classList.remove('low');
      if(!live) lab.textContent='Offer ended';
      else if(rem===undefined) lab.textContent='Limited to '+C.STOCK_PER_OFFER+' bundles';
      else if(out) lab.textContent='Sold out';
      else { lab.textContent=rem+' of '+C.STOCK_PER_OFFER+' bundles left'; lab.classList.toggle('low',rem<=3); }
      btn.disabled=!live||out;
    });
  }
  function refreshStock(){ return fetch('/api/catalog',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(c){ if(c){ C.stock=c.stock; C.serverSkew=c.now-Date.now(); C.OFFER_ENDS=c.offerEnds; renderStock(); } }).catch(function(){}); }

  function tick(){
    var ms=Math.max(0,offerEnd()-now()), s=Math.floor(ms/1000);
    $('cd').textContent=Math.floor(s/86400);
    $('ch').textContent=String(Math.floor(s%86400/3600)).padStart(2,'0');
    $('cm').textContent=String(Math.floor(s%3600/60)).padStart(2,'0');
    $('cs').textContent=String(s%60).padStart(2,'0');
    $('count').classList.toggle('ended',ms===0);
    if(ms===0&&!tick.done){tick.done=1;renderStock();}
  }

  /* ---------- checkout sheet ---------- */
  var sheet=$('sheet'), views=['details','pay','review','closed','ticket'];
  var S={item:null,qty:1,names:[],order:null,view:'details',poll:null,ticket:null};
  var lastFocus=null;
  function show(v){
    views.forEach(function(x){$('v-'+x).classList.toggle('on',x===v)});
    var h=$('v-'+v).querySelector('h2'); if(h) h.focus({preventScroll:true});
    sheet.scrollTop=0; S.view=v; if(v!=='review') stopPoll();
  }
  function openSheet(item){
    S.item=item; S.qty=1; S.names=[]; lastFocus=document.activeElement;
    var isB=item.kind==='bundle';
    $('selBox').style.setProperty('--c',isB?'var(--purple-soft)':'var(--'+item.id+')');
    $('selName').textContent=isB?item.name+' offer (Regular)':item.name;
    $('selTag').textContent=isB?item.people+' people, one price':item.tagline;
    $('qLabel').textContent=isB?'Bundles':'Tickets';
    $('eOrder').textContent=''; updateSum(); show('details');
    if(!sheet.open) sheet.showModal();
    setTimeout(function(){var f=$('names').querySelector('input'); if(f) f.focus({preventScroll:true})},450);
  }
  function maxQty(){
    var it=S.item; if(it.kind!=='bundle') return C.MAX_TICKETS_PER_ORDER;
    var rem=stock(it.id); return rem===undefined?C.MAX_BUNDLES_PER_ORDER:Math.max(1,Math.min(C.MAX_BUNDLES_PER_ORDER,rem));
  }
  function updateSum(){
    var it=S.item, m=maxQty(), isB=it.kind==='bundle', total=it.price*S.qty;
    $('qtyOut').textContent=S.qty; $('qMinus').disabled=S.qty<=1; $('qPlus').disabled=S.qty>=m;
    $('qHint').textContent=isB?('Admits '+(it.people*S.qty)+' people. Max '+m+' per order.'):('Max '+m+' per order.');
    renderNames();
    $('sum').innerHTML='<div><span>'+(isB?it.name+' bundle':it.name+' ticket')+' × '+S.qty+'</span><span>'+fmt(total)+'</span></div><div class="tot"><span>Total</span><span>'+fmt(total)+'</span></div>';
  }
  $('qMinus').addEventListener('click',function(){if(S.qty>1){S.qty--;updateSum()}});
  $('qPlus').addEventListener('click',function(){if(S.qty<maxQty()){S.qty++;updateSum()}});

  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-tier],[data-offer]'); if(!b) return;
    if(b.dataset.tier){ var t=C.TIERS[b.dataset.tier]; openSheet({kind:'tier',id:b.dataset.tier,name:t.name,tagline:t.tagline,price:t.price,people:1}); }
    else { var o=C.OFFERS.filter(function(x){return x.id===b.dataset.offer})[0]; if(!offerLive()) return; openSheet({kind:'bundle',id:o.id,name:o.name,price:o.price,people:o.people}); }
  });
  $('closeBtn').addEventListener('click',function(){sheet.close()});
  $('doneBtn').addEventListener('click',function(){sheet.close()});
  sheet.addEventListener('click',function(e){ if(e.target===sheet) sheet.close(); });
  sheet.addEventListener('close',function(){ stopPoll(); if(lastFocus&&lastFocus.focus) lastFocus.focus(); });

  /* ---------- names (one per person admitted; printed on the ticket exactly as typed) ---------- */
  function people(){ return (S.item.people||1)*S.qty; }
  function nameLabel(i,n){
    if(n===1) return 'Full name';
    return i===0 ? 'Full name (your name)' : 'Full name of person '+(i+1);
  }
  function esc(t){ return String(t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function renderNames(){
    var n=people(), box=$('names'), html='';
    // keep what was typed
    [].slice.call(box.querySelectorAll('input')).forEach(function(inp,i){ S.names[i]=inp.value; });
    S.names.length=n; for(var k=0;k<n;k++) if(S.names[k]==null) S.names[k]='';
    for(var i=0;i<n;i++){
      html+='<div class="field"><label for="fName'+i+'">'+nameLabel(i,n)+'</label>'+
        '<input id="fName'+i+'" data-i="'+i+'" type="text" autocomplete="'+(i===0?'name':'off')+'" maxlength="60" value="'+esc(S.names[i])+'" aria-describedby="nHint"></div>';
    }
    html+='<p class="hint" id="nHint">'+(n>1?'Everyone\'s name is printed on the ticket, so the gate can match the group. ':'')+'Type the name exactly as it should appear on the ticket.</p><p class="err" id="eName" role="alert"></p>';
    box.innerHTML=html;
  }
  $('names').addEventListener('input',function(e){ var i=e.target.dataset&&e.target.dataset.i; if(i!=null){ S.names[i]=e.target.value; e.target.removeAttribute('aria-invalid'); $('eName').textContent=''; } });
  $('names').addEventListener('keydown',function(e){
    if(e.key!=='Enter'||!e.target.dataset||e.target.dataset.i==null) return; e.preventDefault();
    var nx=$('fName'+(Number(e.target.dataset.i)+1)); if(nx) nx.focus(); else $('payBtn').click();
  });
  /* no checking of what the name looks like: only make sure a name was typed for every person */
  function collect(){
    var n=people(), out=[], bad=null;
    for(var i=0;i<n;i++){ var v=String(S.names[i]||'').replace(/\s+/g,' ').trim(); if(!v&&bad===null) bad=i; out.push(v); }
    if(bad!==null){
      $('eName').textContent=n>1?'Enter a name for each person.':'Enter the name for the ticket.';
      var f=$('fName'+bad); if(f){ f.setAttribute('aria-invalid','true'); f.focus(); } return null;
    }
    return out;
  }

  /* ---------- step 1: create order ---------- */
  function busy(btn,on,label){ btn.disabled=on; if(on){btn.dataset.l=btn.innerHTML;btn.textContent=label;} else if(btn.dataset.l){btn.innerHTML=btn.dataset.l;} }
  function saveOrder(){ try{ localStorage.setItem('af_order',JSON.stringify({id:S.order.order_id,k:S.order.token,t:Date.now()})); }catch(e){} }

  $('payBtn').addEventListener('click',function(){
    var names=collect(); if(!names) return; var btn=this; $('eOrder').textContent='';
    busy(btn,true,'Please wait...');
    post('/api/order',{names:names,item:S.item.id,quantity:S.qty}).then(function(o){
      S.order={order_id:o.order_id,token:o.token,total:o.total,label:o.label,kind:o.kind,quantity:o.quantity}; saveOrder(); refreshStock();
      showPay();
    }).catch(function(e){ $('eOrder').textContent=e.message; refreshStock(); }).then(function(){ busy(btn,false); });
  });

  /* ---------- step 2: payment screen ---------- */
  function itemText(o){ return o.kind==='bundle'?o.label+' bundle × '+o.quantity:o.label+' × '+o.quantity; }
  function showPay(){
    var o=S.order, P=C.PAY;
    $('pItem').textContent=itemText(o); $('pTotal').textContent=fmt(o.total);
    $('pBank').textContent=P.bank; $('pPaybill').textContent=P.paybill; $('pAccount').textContent=P.account;
    $('pAmount').textContent=fmt(o.total); $('pRef').textContent=o.order_id;
    $('hPay').textContent=P.paybill; $('hAcc').textContent=P.account;
    $('fCode').value=''; $('eCode').textContent=''; $('fCode').removeAttribute('aria-invalid');
    show('pay');
  }
  function copyValue(key){ var o=S.order,P=C.PAY; return key==='paybill'?P.paybill:key==='account'?P.account:key==='amount'?String(o.total):o.order_id; }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-copy]'); if(!b||!S.order) return;
    var row=b.closest('.cp')||b, i=row.querySelector('.cbtn i');
    AFT.copy(copyValue(b.dataset.copy)).then(function(ok){
      row.classList.toggle('done',ok); if(i) i.textContent=ok?'Copied ✓':'Press and hold';
      clearTimeout(row._t); row._t=setTimeout(function(){row.classList.remove('done'); if(i) i.textContent='Copy';},1800);
    });
  });
  $('payBack').addEventListener('click',function(){ show('details'); });

  /* ---------- step 3: submit transaction code (never creates a ticket on its own) ---------- */
  $('fCode').addEventListener('input',function(){ var v=this.value.toUpperCase().replace(/[^A-Z0-9]/g,''); if(v!==this.value) this.value=v; });
  $('codeBtn').addEventListener('click',submitCode);
  $('fCode').addEventListener('keydown',function(e){ if(e.key==='Enter'){e.preventDefault();submitCode();} });
  function submitCode(){
    var code=$('fCode').value.trim().toUpperCase(), er=$('eCode'), btn=$('codeBtn');
    er.textContent=''; $('fCode').removeAttribute('aria-invalid');
    if(!/^[A-Z0-9]{8,20}$/.test(code)){ er.textContent='Enter the code from your payment message. It has 8 to 20 letters and numbers.'; $('fCode').setAttribute('aria-invalid','true'); $('fCode').focus(); return; }
    busy(btn,true,'Checking...');
    post('/api/submit-code',{order_id:S.order.order_id,token:S.order.token,txn_code:code}).then(function(r){ route(r); })
      .catch(function(e){ er.textContent=e.message; $('fCode').setAttribute('aria-invalid','true'); }).then(function(){ busy(btn,false); });
  }

  /* ---------- verification screen + polling ---------- */
  function showReview(r){
    $('rRef').textContent=r.order_id; $('rAmt').textContent=fmt(r.total); $('rCode').textContent=r.txn_code||'';
    var help=$('rHelp'); if(C.CONTACT_WHATSAPP){ help.href='https://wa.me/'+C.CONTACT_WHATSAPP+'?text='+encodeURIComponent('Hi, my order '+r.order_id+' is awaiting verification.'); help.hidden=false; }
    $('rMsg').textContent='Checking with the bank...';
    show('review'); startPoll();
  }
  function startPoll(){
    stopPoll(); var started=Date.now(), n=0;
    (function loop(){
      S.poll=setTimeout(function(){
        if(!sheet.open||S.view!=='review') return;
        n++; api('/api/order-status?id='+encodeURIComponent(S.order.order_id)+'&token='+encodeURIComponent(S.order.token),{cache:'no-store'}).then(function(r){
          if(r.status!=='AWAITING_VERIFICATION'){ route(r); return; }
          var mins=(Date.now()-started)/60000;
          $('rMsg').textContent= mins>4?'Still confirming. Bank confirmations can take a few minutes. You can safely leave this page open.':'Checking with the bank...';
          loop();
        }).catch(function(){ loop(); });
      }, n<12?4000:12000);
    })();
  }
  function stopPoll(){ clearTimeout(S.poll); S.poll=null; }
  $('rCopy').addEventListener('click',function(){ var b=this; AFT.copy(S.order.order_id).then(function(){ b.textContent='Copied'; setTimeout(function(){b.textContent='Copy order reference'},1600); }); });

  /* send the customer to the right screen for the order's real, server-side status */
  function route(r){
    S.order={order_id:r.order_id,token:S.order.token,total:r.total,label:r.label,kind:r.kind,quantity:r.quantity};
    if(r.status==='PAID') return loadTicket();
    if(r.status==='AWAITING_VERIFICATION') return showReview(r);
    if(r.status==='REJECTED'){ $('closedMsg').textContent='We could not match this payment to your order '+r.order_id+'. If you paid, contact us with this reference and your M-Pesa message and we will sort it out.'; show('closed'); return; }
    showPay();
  }
  $('newOrder').addEventListener('click',function(){ try{localStorage.removeItem('af_order')}catch(e){} $('mine').hidden=true; show('details'); });

  /* ---------- ticket ---------- */
  function loadTicket(){
    return api('/api/ticket?id='+encodeURIComponent(S.order.order_id)+'&token='+encodeURIComponent(S.order.token),{cache:'no-store'}).then(function(t){
      S.ticket=t; AFT.render(t); show('ticket');
    }).catch(function(e){ $('rMsg').textContent=e.message; show('review'); });
  }
  $('saveBtn').addEventListener('click',function(){ var b=this; busy(b,true,'Preparing...'); AFT.saveToPhone(S.ticket).then(function(){busy(b,false)},function(){busy(b,false)}); });
  $('dlBtn').addEventListener('click',function(){ var b=this; busy(b,true,'Preparing...'); AFT.download(S.ticket).then(function(){busy(b,false)},function(){busy(b,false)}); });
  $('linkBtn').addEventListener('click',function(){ var b=this; AFT.copy(AFT.link(S.ticket,S.order.token)).then(function(){ b.textContent='Link copied'; setTimeout(function(){b.textContent='Copy my ticket link'},1800); }); });
  $('dt').addEventListener('pointermove',function(e){
    var b=this.getBoundingClientRect();
    this.style.setProperty('--mx',((e.clientX-b.left)/b.width*100)+'%'); this.style.setProperty('--my',((e.clientY-b.top)/b.height*100)+'%');
  });
  $('dt').addEventListener('touchstart',function(){this.classList.add('touch')},{passive:true});

  /* ---------- come back to an order ---------- */
  function savedOrder(){ try{ var o=JSON.parse(localStorage.getItem('af_order')||'null'); if(o&&o.id&&o.k&&Date.now()-o.t<30*864e5) return o; }catch(e){} return null; }
  var sv=savedOrder();
  if(sv){
    $('mine').hidden=false;
    $('mineBtn').addEventListener('click',function(){
      var b=this; lastFocus=b; b.disabled=true;
      api('/api/order-status?id='+encodeURIComponent(sv.id)+'&token='+encodeURIComponent(sv.k),{cache:'no-store'}).then(function(r){
        S.order={order_id:r.order_id,token:sv.k,total:r.total,label:r.label,kind:r.kind,quantity:r.quantity};
        if(!sheet.open) sheet.showModal(); route(r);
      }).catch(function(e){ alert(e.message); }).then(function(){ b.disabled=false; });
    });
  }

  function hashFocus(){
    var id=location.hash.slice(1), el=id&&document.getElementById(id);
    if(el&&el.classList.contains('tk')){ el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }

  /* ---------- start ---------- */
  Promise.race([C.catalogReady,sleep(2500)]).then(function(){
    renderCards(); tick(); setInterval(tick,1000); setInterval(refreshStock,30000);
    hashFocus(); addEventListener('hashchange',hashFocus);
    if(location.hash){ var t=document.getElementById(location.hash.slice(1)); if(t) setTimeout(function(){t.scrollIntoView()},60); }
  });
})();
