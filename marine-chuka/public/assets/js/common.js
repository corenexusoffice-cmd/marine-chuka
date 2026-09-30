(function(){
  var d=document, root=d.documentElement;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* live catalog from the server (prices, offer end, stock). Falls back to config.js if the API is unreachable. */
  var AFc=window.AF||{};
  AFc.catalogReady=fetch('/api/catalog',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null}).then(function(c){
    if(!c) return null;
    AFc.OFFER_ENDS=c.offerEnds; AFc.STOCK_PER_OFFER=c.stockPerOffer; AFc.MAX_BUNDLES_PER_ORDER=c.maxBundles; AFc.MAX_TICKETS_PER_ORDER=c.maxTickets; AFc.PAY=c.pay;
    Object.keys(c.tiers).forEach(function(k){ if(AFc.TIERS[k]) AFc.TIERS[k].price=c.tiers[k].price; });
    AFc.OFFERS.forEach(function(o){ var x=c.offers[o.id]; if(x){o.price=x.price;o.people=x.people;o.name=x.name;} });
    AFc.stock=c.stock; AFc.serverSkew=c.now-Date.now();
    return c;
  });

  /* offer bar: always-visible 3-day countdown */
  var ob=d.getElementById('obar');
  if(ob&&AFc.OFFER_ENDS){
    var oc=function(){
      var end=new Date(AFc.OFFER_ENDS).getTime(), ms=end-(Date.now()+(AFc.serverSkew||0));
      if(ms<=0){ ob.hidden=true; return; }
      var s=Math.floor(ms/1000), dd=Math.floor(s/86400), hh=String(Math.floor(s%86400/3600)).padStart(2,'0'), mm=String(Math.floor(s%3600/60)).padStart(2,'0'), ss=String(s%60).padStart(2,'0');
      ob.hidden=false;
      ob.innerHTML='<span class="dot"></span><span class="t">Group offer ends in <b>'+dd+'d '+hh+':'+mm+':'+ss+'</b></span><span class="c">Save up to KES 400 <i>→</i></span>';
    };
    oc(); setInterval(oc,1000); AFc.catalogReady.then(oc);
  }

  /* marquee */
  var mq=d.getElementById('mq');
  if(mq){
    var items=['03 OCT 2026','MARINE PARK','CHUKA','AFROPIANO','MUSIC','PEOPLE','CULTURE'];
    var html=''; for(var r=0;r<4;r++) items.forEach(function(t){html+='<span>'+t+'</span>'});
    mq.innerHTML=html+html;
  }

  /* loader (once per session) */
  var loader=d.getElementById('loader'), seen=false;
  try{ seen=sessionStorage.getItem('af_seen')==='1'; }catch(e){}
  function ready(){ d.body.classList.add('is-ready'); root.classList.add('is-ready'); }
  if(loader){
    if(seen||reduce){ loader.classList.add('gone'); ready(); }
    else{
      setTimeout(function(){ loader.classList.add('done'); ready(); try{sessionStorage.setItem('af_seen','1')}catch(e){} },1150);
      setTimeout(function(){ loader.classList.add('gone'); },2100);
    }
  } else ready();

  /* nav */
  var nav=d.getElementById('nav');
  var prog=d.getElementById('prog');
  function onScroll(){
    if(nav){ nav.classList.toggle('scrolled',scrollY>30); var bh=(ob&&!ob.hidden)?ob.offsetHeight:0; nav.style.top=Math.max(0,bh-scrollY)+'px'; }
    if(prog){ var m=d.documentElement.scrollHeight-innerHeight; prog.style.transform='scaleX('+(m>0?Math.min(1,scrollY/m):0)+')'; }
  }
  addEventListener('scroll',onScroll,{passive:true}); onScroll();

  /* mobile drawer */
  var burger=d.getElementById('burger'), drawer=d.getElementById('drawer');
  function setMenu(open){
    if(!burger||!drawer) return;
    drawer.classList.toggle('open',open);
    burger.setAttribute('aria-expanded',open);
    burger.setAttribute('aria-label',open?'Close menu':'Open menu');
    d.body.style.overflow=open?'hidden':'';
  }
  if(burger){
    burger.addEventListener('click',function(){setMenu(!drawer.classList.contains('open'))});
    drawer.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){setMenu(false)})});
    d.addEventListener('keydown',function(e){if(e.key==='Escape')setMenu(false)});
    matchMedia('(min-width:861px)').addEventListener('change',function(e){if(e.matches)setMenu(false)});
  }

  /* active link on scroll */
  var links=[].slice.call(d.querySelectorAll('.links a.l'));
  if(links.length&&'IntersectionObserver' in window){
    var map={};
    links.forEach(function(a){var id=a.getAttribute('href').slice(1);var el=d.getElementById(id);if(el)map[id]={a:a,el:el}});
    var io2=new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){ links.forEach(function(l){l.classList.remove('on')}); var m=map[e.target.id]; if(m)m.a.classList.add('on'); } });
    },{rootMargin:'-45% 0px -50% 0px'});
    Object.keys(map).forEach(function(k){io2.observe(map[k].el)});
  }

  /* reveal */
  var rv=d.querySelectorAll('.rv,.mask');
  if('IntersectionObserver' in window&&!reduce){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:0,rootMargin:"0px 0px -8% 0px"});
    rv.forEach(function(el){io.observe(el)});
    /* fallback: anything the visitor scrolled or jumped past still gets revealed */
    var pend=[].slice.call(rv), chk=false;
    function sweep(){
      chk=false;
      pend=pend.filter(function(el){
        if(el.classList.contains('in')) return false;
        if(el.getBoundingClientRect().top<innerHeight*.92){ el.classList.add('in'); io.unobserve(el); return false; }
        return true;
      });
    }
    addEventListener('scroll',function(){ if(!chk){chk=true;requestAnimationFrame(sweep)} },{passive:true});
    addEventListener('hashchange',function(){setTimeout(sweep,50)});
  } else rv.forEach(function(el){el.classList.add('in')});

  /* sticky bottom CTA: shows after the hero CTA leaves the screen */
  var sticky=d.getElementById('sticky'), heroCta=d.getElementById('heroCta');
  if(sticky&&heroCta&&'IntersectionObserver' in window){
    d.body.classList.add('has-sticky');
    var so=new IntersectionObserver(function(es){
      var e=es[0]; var gone=!e.isIntersecting&&e.boundingClientRect.top<0;
      sticky.classList.toggle('show',gone);
    });
    so.observe(heroCta);
  }

  /* parallax: ghost text + hero poster (small, transform only) */
  var ghost=d.getElementById('ghost'), fin=d.getElementById('join'), tick=false;
  function par(){
    tick=false;
    if(ghost&&fin){
      var r=fin.getBoundingClientRect(), h=innerHeight;
      if(r.bottom>0&&r.top<h){
        var p=(h-r.top)/(h+r.height);            // 0..1 through viewport
        ghost.style.transform='translate3d('+(-p*18).toFixed(2)+'%,-50%,0)';
      }
    }
  }
  if(!reduce){
    addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(par)}},{passive:true}); par();
    var pi=d.getElementById('posterImg');
    if(pi&&matchMedia('(pointer:fine)').matches){
      var poster=pi.closest('.poster');
      poster.addEventListener('pointermove',function(e){
        var b=poster.getBoundingClientRect();
        var x=((e.clientX-b.left)/b.width-.5)*6, y=((e.clientY-b.top)/b.height-.5)*4;
        pi.style.transition='transform .3s ease-out';
        pi.style.transform='scale(1.02) translate3d('+(-x).toFixed(1)+'px,'+(-y).toFixed(1)+'px,0)';
      });
      poster.addEventListener('pointerleave',function(){pi.style.transition='';pi.style.transform=''});
    }
  }

  /* days to go (real countdown to event date, Nairobi time) */
  var dl=d.getElementById('daysLeft');
  if(dl){
    var ev=new Date('2026-10-03T00:00:00+03:00').getTime(), now=Date.now();
    var n=Math.ceil((ev-now)/86400000);
    if(n>1) dl.textContent=n+' days to go';
    else if(n===1) dl.textContent='Tomorrow night';
    else if(now<ev+86400000) dl.textContent='Tonight';
  }

  /* contact link */
  var cl=d.getElementById('contactLink');
  if(cl&&window.AF){
    if(AF.CONTACT_WHATSAPP){cl.href='https://wa.me/'+AF.CONTACT_WHATSAPP;cl.textContent='WhatsApp us';cl.target='_blank';cl.rel='noopener'}
    else if(AF.CONTACT_EMAIL){cl.href='mailto:'+AF.CONTACT_EMAIL;cl.textContent=AF.CONTACT_EMAIL}
    else cl.closest('li').style.display='none';
  }
})();
