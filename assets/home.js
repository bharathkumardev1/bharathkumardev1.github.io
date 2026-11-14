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
