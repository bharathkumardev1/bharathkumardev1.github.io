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

/* motion layer: replaying reveals, count-ups, progress line, active nav. Does nothing when html.mo is absent. */
(function(){
  var root=document.documentElement;
  var bar=document.createElement('div');bar.className='prog';bar.setAttribute('aria-hidden','true');document.body.appendChild(bar);
  /* progress line: CSS scroll timeline where supported, one cheap rAF listener otherwise */
  if(!(window.CSS&&CSS.supports&&CSS.supports('animation-timeline:scroll()'))){
    var ticking=false;
    var prog=function(){var h=root.scrollHeight-window.innerHeight;bar.style.setProperty('--p',h>0?Math.min(1,window.scrollY/h):0);ticking=false;};
    window.addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(prog);}},{passive:true});prog();
  }
  if(!('IntersectionObserver' in window)) return;

  /* underline the section you are in */
  var links={};[].forEach.call(document.querySelectorAll('.nav a[href^="#"]'),function(a){links[a.getAttribute('href').slice(1)]=a;});
  var navIO=new IntersectionObserver(function(es){es.forEach(function(e){
    var a=links[e.target.id];if(a&&e.isIntersecting){Object.keys(links).forEach(function(k){links[k].classList.toggle('on',links[k]===a);});}
  });},{rootMargin:'-40% 0px -55% 0px'});
  ['projects','experience','skills'].forEach(function(id){var s=document.getElementById(id);if(s)navIO.observe(s);});

  if(!root.classList.contains('mo')) return;

  var hero=document.querySelector('.hero');
  if(hero){
    var hl=[hero.querySelector('.eyebrow'),hero.querySelector('.id img'),hero.querySelector('h1'),hero.querySelector('.role')]
      .concat([].slice.call(hero.querySelectorAll('.links li')),[hero.querySelector('.cue')]);
    hl.forEach(function(el,i){if(el){el.classList.add('hl');el.style.setProperty('--i',i);}});
  }

  var targets=[];
  function add(sel,idx,dir){[].forEach.call(document.querySelectorAll(sel),function(el,i){
    el.classList.add('rv');
    var d=typeof dir==='function'?dir(i):dir;if(d)el.classList.add(d);
    el.style.setProperty('--i',idx?idx(i):0);targets.push(el);});}
  add('.head',null,'rv-l');
  add('.about',function(i){return i;});
  add('.stat',function(i){return i;},'rv-s');
  add('.climb .l > :not(.sr)',function(i){return i;},'rv-l');
  add('.climb ol li',function(i){return i+1;},'rv-r');
  add('.card',function(i){return i%2;},function(i){return i%2?'rv-r':'rv-l';});
  add('.job',null,'rv-l');
  add('.skill',function(i){return i;});
  [].forEach.call(document.querySelectorAll('.skill .tags li'),function(li,i){li.style.setProperty('--t',i%12);});
  var climb=document.getElementById('climb');
  if(climb){climb.classList.add('arm');targets.push(climb);}

  function count(el){
    var txt=el.getAttribute('data-final')||el.textContent,m=txt.match(/^(\d*\.?\d+)(\D*)$/);if(!m)return;
    el.setAttribute('data-final',txt);
    var end=parseFloat(m[1]),dec=(m[1].split('.')[1]||'').length,suf=m[2],t0=null,dur=1300,id=++el._c;
    el.textContent=(0).toFixed(dec)+suf;
    var last='';
    function step(ts){if(id!==el._c)return;if(t0===null)t0=ts;var p=Math.min(1,(ts-t0)/dur),e=1-Math.pow(1-p,4);
      if(p<1){var v=(end*e).toFixed(dec)+suf;if(v!==last){last=v;el.textContent=v;}requestAnimationFrame(step);}else{el.textContent=txt;}}
    requestAnimationFrame(step);
  }
  [].forEach.call(document.querySelectorAll('.stat b,.climb .num'),function(b){b._c=0;});

  function enter(el){
    if(el.classList.contains('in'))return;
    el.classList.add('in');
    if(el.classList.contains('stat')){var b=el.querySelector('b');if(b)count(b);}
    if(el===climb){var n=el.querySelector('.num');if(n)count(n);}
  }
  function leave(el){
    if(!el.classList.contains('in'))return;
    el.classList.remove('in');
    var b=el.classList.contains('stat')?el.querySelector('b'):(el===climb?el.querySelector('.num'):null);
    if(b){b._c++;if(b.getAttribute('data-final'))b.textContent=b.getAttribute('data-final');}
  }
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    var el=e.target;
    if(e.isIntersecting&&(e.intersectionRatio>=.15||e.intersectionRect.height>=window.innerHeight*.25))enter(el);
    else if(!e.isIntersecting)leave(el);
  });},{threshold:[0,.15],rootMargin:'0px 0px -6% 0px'});
  targets.forEach(function(el){io.observe(el);});
  window.addEventListener('beforeprint',function(){targets.forEach(function(el){el.classList.add('in');});});
})();
