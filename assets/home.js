(function(){
  document.documentElement.classList.add('js');
  var top=document.getElementById('top');
  function sc(){top.classList.toggle('scrolled',window.scrollY>8);}
  window.addEventListener('scroll',sc,{passive:true});requestAnimationFrame(sc);
  var ch=document.querySelector('.chart[data-series]');
  if(ch){
    var data=JSON.parse(ch.getAttribute('data-series')),cap=document.getElementById('cap'),cur=document.getElementById('cur');
    function setCap(){var n=parseInt(cap.value,10),x=44+540*n/30;
      document.getElementById('capv').textContent=n+'%';cur.style.display='';cur.setAttribute('x1',x);cur.setAttribute('x2',x);
      data.forEach(function(s,i){var y=224-208*s[n]/.6,d=document.getElementById('dot-'+i);d.setAttribute('cx',x);d.setAttribute('cy',y);document.getElementById('lv-'+i).textContent=(s[n]*100).toFixed(1)+'%';});}
    cap.addEventListener('input',setCap);setCap();
  }
})();

/* motion layer: reveals, count-ups, progress bar, active nav. Skipped entirely when html.mo is absent. */
(function(){
  var root=document.documentElement;
  var bar=document.createElement('div');bar.className='prog';bar.setAttribute('aria-hidden','true');document.body.appendChild(bar);
  var ticking=false;
  function prog(){var h=root.scrollHeight-window.innerHeight;bar.style.setProperty('--p',h>0?Math.min(1,window.scrollY/h):0);ticking=false;}
  window.addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(prog);}},{passive:true});prog();

  if(!('IntersectionObserver' in window)) return;

  /* active section in the nav */
  var links={};[].forEach.call(document.querySelectorAll('.nav a[href^="#"]'),function(a){links[a.getAttribute('href').slice(1)]=a;});
  var navIO=new IntersectionObserver(function(es){es.forEach(function(e){
    var a=links[e.target.id];if(a&&e.isIntersecting){Object.keys(links).forEach(function(k){links[k].classList.toggle('on',links[k]===a);});}
  });},{rootMargin:'-40% 0px -55% 0px'});
  ['projects','experience','skills'].forEach(function(id){var s=document.getElementById(id);if(s)navIO.observe(s);});

  if(!root.classList.contains('mo')) return;

  function mark(el,i,cls){el.classList.add('rv');if(cls)el.classList.add(cls);el.style.setProperty('--i',i);}
  /* hero entrance */
  var hero=document.querySelector('.hero');
  if(hero){
    var hl=[hero.querySelector('.eyebrow'),hero.querySelector('.id img'),hero.querySelector('h1'),hero.querySelector('.role')]
      .concat([].slice.call(hero.querySelectorAll('.links li')));
    hl.forEach(function(el,i){if(el){el.classList.add('hl');el.style.setProperty('--i',i);}});
  }
  /* scroll reveals */
  var targets=[];
  function add(sel,fn,cls){[].forEach.call(document.querySelectorAll(sel),function(el,i){mark(el,fn?fn(i,el):0,cls);targets.push(el);});}
  add('.head');
  add('.about',function(i){return i;});
  add('.stat',function(i){return i;});
  add('.climb .l > :not(.sr)',function(i){return i;});
  add('.climb ol li',function(i){return i+2;});
  add('.card',function(i){return i%2;});
  add('.job',null,'rv-l');
  add('.skill',function(i){return i;});
  [].forEach.call(document.querySelectorAll('.skill .tags li'),function(li,i){li.style.setProperty('--t',i%12);});

  function count(el){
    var txt=el.textContent,m=txt.match(/^(\d*\.?\d+)(\D*)$/);if(!m)return;
    var end=parseFloat(m[1]),dec=(m[1].split('.')[1]||'').length,suf=m[2],t0=null,dur=1400;
    el.textContent=(0).toFixed(dec)+suf;
    function step(ts){if(t0===null)t0=ts;var p=Math.min(1,(ts-t0)/dur),e=1-Math.pow(1-p,4);
      if(p<1){el.textContent=(end*e).toFixed(dec)+suf;requestAnimationFrame(step);}else{el.textContent=txt;}}
    requestAnimationFrame(step);
  }
  var climb=document.getElementById('climb');
  if(climb){climb.classList.add('arm');targets.push(climb);}

  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    if(!e.isIntersecting)return;
    var el=e.target;io.unobserve(el);el.classList.add('in');
    if(el.classList.contains('stat')){var b=el.querySelector('b');if(b)count(b);}
    if(el===climb){var n=el.querySelector('.num');if(n)count(n);}
    var d=(parseFloat(el.style.getPropertyValue('--i'))||0)*90+1000;
    setTimeout(function(){el.classList.add('done');},d);
  });},{threshold:.12,rootMargin:'0px 0px -6% 0px'});
  targets.forEach(function(el){io.observe(el);});
  window.addEventListener('beforeprint',function(){targets.forEach(function(el){el.classList.add('in','done');});});
})();
