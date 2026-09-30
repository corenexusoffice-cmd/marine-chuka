/* Ticket rendering shared by tickets.html (checkout sheet) and ticket.html (the shareable link).
   Draws the on-screen ticket and makes a PNG for download / phone gallery / WhatsApp. */
(function(){
  'use strict';
  var COLORS={regular:'#5BB8FF',vip:'#FFBE32',vvip:'#FF4D5A',bundle:'#9B70F5'};
  function qr(text){ var q=qrcode(0,'M'); q.addData(text); q.make(); return q; }
  function namesOf(t){ var a=(t.names&&t.names.length)?t.names:String(t.name||'').split('\n'); a=a.map(function(x){return String(x).trim()}).filter(Boolean); return a.length?a:['']; }
  function catLabel(t){ return t.bundle? 'Regular · '+t.label : t.label; }

  /* fill the .dt markup */
  function render(t){
    var dt=document.getElementById('dt'); if(!dt) return;
    var isBundle=/^(Couple|Group)/.test(t.label);
    t.bundle=isBundle;
    dt.className='dt '+(isBundle?'bundle':t.tier);
    document.getElementById('dtCat').textContent=isBundle?'Regular · '+t.label:t.label;
    var names=namesOf(t), box=document.getElementById('dtName');
    box.innerHTML=''; box.className='who'+(names.length>1?' multi':'');
    var lab=document.createElement('small'); lab.textContent=names.length>1?'TICKET HOLDERS':'TICKET HOLDER'; box.appendChild(lab);
    names.forEach(function(n,i){ var d=document.createElement('div'); d.className='nm'; if(names.length>1){ var k=document.createElement('i'); k.textContent=(i+1)+'.'; d.appendChild(k); } d.appendChild(document.createTextNode(n)); box.appendChild(d); });
    document.getElementById('dtId').textContent=t.serial;
    document.getElementById('dtAdmits').textContent='ADMITS '+t.admits+(t.admits>1?' PEOPLE':' PERSON');
    document.getElementById('dtQr').innerHTML=qr(t.qr).createSvgTag({cellSize:4,margin:0,scalable:true});
  }

  function rr(x,c,X,Y,W,H,R){ x.beginPath(); x.moveTo(X+R,Y); x.arcTo(X+W,Y,X+W,Y+H,R); x.arcTo(X+W,Y+H,X,Y+H,R); x.arcTo(X,Y+H,X,Y,R); x.arcTo(X,Y,X+W,Y,R); x.closePath(); }
  function fit(x,text,max,size,weight){ while(size>22){ x.font=weight+' '+size+'px Satoshi,system-ui,sans-serif'; if(x.measureText(text).width<=max) break; size-=2; } return size; }

  function png(t){
    var load=(document.fonts&&document.fonts.load)?Promise.all([document.fonts.load('900 60px Satoshi'),document.fonts.load('500 30px Satoshi'),document.fonts.load('700 30px Satoshi')]).catch(function(){}):Promise.resolve();
    return load.then(function(){
      var names=namesOf(t), LH=names.length>6?66:76, W=1080, pad=54;
      var nameEnd=pad+730+(names.length-1)*LH, admY=nameEnd+70, PY=admY+100, BOX=560;
      var H=PY+70+BOX+192+pad+40;
      var cv=document.createElement('canvas'); cv.width=W; cv.height=H; var x=cv.getContext('2d');
      var col=COLORS[t.bundle?'bundle':t.tier]||COLORS.regular;
      var g=x.createLinearGradient(0,0,W,H); g.addColorStop(0,'#1a1226'); g.addColorStop(1,'#0a0710'); x.fillStyle='#0A0710'; x.fillRect(0,0,W,H);
      var cw=W-pad*2, ch=H-pad*2;
      rr(x,0,pad,pad,cw,ch,44); x.fillStyle=g; x.fill(); x.lineWidth=4; x.strokeStyle=col; x.stroke();
      var glow=x.createRadialGradient(W*.85,pad,10,W*.85,pad,700); glow.addColorStop(0,'rgba(108,53,212,.55)'); glow.addColorStop(1,'rgba(108,53,212,0)');
      x.save(); rr(x,0,pad,pad,cw,ch,44); x.clip(); x.fillStyle=glow; x.fillRect(0,0,W,H); x.restore();
      var L=pad+70;
      x.fillStyle='#fff'; x.textBaseline='alphabetic';
      x.font='900 118px Satoshi,system-ui,sans-serif'; x.fillText('AFROPIANO',L,pad+220);
      x.fillStyle='#A9A3B2'; x.font='700 34px Satoshi,system-ui,sans-serif'; x.fillText('E D I T I O N   1   ·   C H U K A',L,pad+282);
      // tier badge
      var cat=(t.bundle?'REGULAR · '+t.label:t.label).toUpperCase(); x.font='900 40px Satoshi,system-ui,sans-serif';
      var bw=x.measureText(cat).width+60; rr(x,0,L,pad+340,bw,80,14); x.fillStyle=col; x.fill(); x.fillStyle='#0A0710'; x.fillText(cat,L+30,pad+394);
      x.fillStyle='#A9A3B2'; x.font='500 36px Satoshi,system-ui,sans-serif'; x.fillText('03 OCTOBER 2026',L,pad+500); x.fillText('MARINE PARK RESORT, CHUKA',L,pad+552);
      x.fillStyle='#A9A3B2'; x.font='700 28px Satoshi,system-ui,sans-serif'; x.fillText(names.length>1?'TICKET HOLDERS':'TICKET HOLDER',L,pad+650);
      names.forEach(function(n,i){
        var nm=(names.length>1?(i+1)+'.  ':'')+n.toUpperCase(), sz=fit(x,nm,cw-140,names.length>1?52:64,900);
        x.fillStyle='#fff'; x.font='900 '+sz+'px Satoshi,system-ui,sans-serif'; x.fillText(nm,L,pad+730+i*LH);
      });
      x.fillStyle=col; x.font='700 36px Satoshi,system-ui,sans-serif'; x.fillText('ADMITS '+t.admits+(t.admits>1?' PEOPLE':' PERSON'),L,admY);
      // perforation
      var py=PY; x.setLineDash([16,14]); x.strokeStyle='rgba(255,255,255,.25)'; x.lineWidth=3; x.beginPath(); x.moveTo(pad+50,py); x.lineTo(W-pad-50,py); x.stroke(); x.setLineDash([]);
      x.fillStyle='#0A0710'; [pad,W-pad].forEach(function(cx){ x.beginPath(); x.arc(cx,py,34,0,7); x.fill(); x.lineWidth=4; x.strokeStyle=col; x.stroke(); });
      // QR
      var q=qr(t.qr), n=q.getModuleCount(), box=BOX, quiet=28, cell=Math.floor((box-quiet*2)/n), qs=cell*n, bx=(W-box)/2, by=py+70;
      rr(x,0,bx,by,box,box,26); x.fillStyle='#fff'; x.fill();
      var ox=bx+(box-qs)/2, oy=by+(box-qs)/2; x.fillStyle='#000';
      for(var r=0;r<n;r++) for(var c=0;c<n;c++) if(q.isDark(r,c)) x.fillRect(ox+c*cell,oy+r*cell,cell,cell);
      x.textAlign='center'; x.fillStyle='#A9A3B2'; x.font='500 28px Satoshi,system-ui,sans-serif'; x.fillText('TICKET ID',W/2,by+box+62);
      x.fillStyle='#fff'; x.font='900 62px Satoshi,system-ui,sans-serif'; x.fillText(t.serial,W/2,by+box+134);
      x.fillStyle='#A9A3B2'; x.font='500 28px Satoshi,system-ui,sans-serif'; x.fillText('Show this at the gate with a valid ID (18+)',W/2,by+box+192);
      x.textAlign='left';
      return new Promise(function(res){ cv.toBlob(function(b){res(b)},'image/png'); });
    });
  }

  function fileName(t){ return 'Afropiano-'+t.serial+'.png'; }
  function download(t){
    return png(t).then(function(b){
      var u=URL.createObjectURL(b), a=document.createElement('a'); a.href=u; a.download=fileName(t); document.body.appendChild(a); a.click();
      setTimeout(function(){URL.revokeObjectURL(u);a.remove()},4000);
    });
  }
  /* on phones this opens the share sheet, which has "Save Image" / "Save to Photos" and WhatsApp */
  function saveToPhone(t){
    return png(t).then(function(b){
      var f=new File([b],fileName(t),{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[f]})){ return navigator.share({files:[f],title:'Afropiano ticket '+t.serial}).catch(function(e){ if(e&&e.name!=='AbortError') return download(t); }); }
      return download(t);
    });
  }
  function link(t,token){ return location.origin+location.pathname.replace(/[^/]*$/,'')+'ticket.html?id='+encodeURIComponent(t.serial)+'&k='+encodeURIComponent(token); }
  function copy(text){
    if(navigator.clipboard&&window.isSecureContext) return navigator.clipboard.writeText(text).then(function(){return true},function(){return legacy(text)});
    return Promise.resolve(legacy(text));
  }
  function legacy(text){
    try{ var a=document.createElement('textarea'); a.value=text; a.setAttribute('readonly',''); a.style.cssText='position:fixed;left:-9999px;top:0;font-size:16px'; document.body.appendChild(a); a.select(); a.setSelectionRange(0,99999); var ok=document.execCommand('copy'); a.remove(); return ok; }catch(e){ return false; }
  }
  window.AFT={render:render,png:png,download:download,saveToPhone:saveToPhone,link:link,copy:copy};
})();
