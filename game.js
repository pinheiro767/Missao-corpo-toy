(() => {
  'use strict';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const screens = $$('.screen');
  const canvas = $('#game-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const organMeta = {
    heart:      { label:'Coração',     src:'assets/organs/heart.png',      x:330,  y:535, size:90 },
    lungs:      { label:'Pulmões',     src:'assets/organs/lungs.png',      x:690,  y:300, size:105 },
    stomach:    { label:'Estômago',    src:'assets/organs/stomach.png',    x:975,  y:175, size:92 },
    intestines: { label:'Intestinos',  src:'assets/organs/intestines.png', x:1375, y:410, size:105 }
  };
  const order = ['heart','lungs','stomach','intestines'];
  const targetPlacement = {
    lungs:{x:50,y:35}, heart:{x:53,y:40}, stomach:{x:55,y:49}, intestines:{x:50,y:59}
  };

  const assets = { images:{} };
  const imageList = {
    bg:'assets/scene/lab.png',
    walk:'assets/player/walk.png',
    jump:'assets/player/jump.png',
    pick:'assets/player/pick.png',
    celebrate:'assets/player/celebrate.png',
    carry:'assets/player/carry_heart.png',
    ...Object.fromEntries(Object.entries(organMeta).map(([k,v])=>[`organ_${k}`,v.src]))
  };
  function loadImages(){
    return Promise.all(Object.entries(imageList).map(([key,src]) => new Promise((resolve,reject)=>{
      const img=new Image(); img.onload=()=>{assets.images[key]=img; resolve();}; img.onerror=reject; img.src=src;
    })));
  }

  let started=false, paused=false, soundOn=true, raf=0, last=0, deferredInstall=null;
  let collected = new Set();
  let placed = new Set();
  let toastTimer=0;
  const input={left:false,right:false,jump:false};
  const player={x:70,y:420,vx:0,vy:0,w:78,h:190,onGround:false,facing:1,state:'idle',frame:0,frameT:0,pickT:0};
  const platforms=[
    {x:0,y:620,w:1536},
    {x:275,y:510,w:275},
    {x:585,y:390,w:225},
    {x:885,y:265,w:205},
    {x:1315,y:490,w:221}
  ];

  function showScreen(id){
    screens.forEach(s=>s.classList.remove('active'));
    $(id).classList.add('active');
  }
  function toast(msg,ms=1500){
    const el=$('#toast'); el.textContent=msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),ms);
  }
  function speak(text){
    if(!soundOn || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text); u.lang='pt-BR'; u.rate=.94; u.pitch=1.06;
    speechSynthesis.speak(u);
  }
  let audioCtx=null;
  function tone(freq=520,dur=.12,type='sine',gain=.055){
    if(!soundOn) return;
    try{
      audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended') audioCtx.resume();
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type=type; o.frequency.value=freq; g.gain.value=gain;
      o.connect(g); g.connect(audioCtx.destination); o.start(); g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur); o.stop(audioCtx.currentTime+dur);
    }catch(e){}
  }
  const sounds={jump:()=>tone(480,.1,'square',.035),collect:()=>{tone(660,.12);setTimeout(()=>tone(880,.14),80)},correct:()=>{tone(620,.12);setTimeout(()=>tone(820,.12),80);setTimeout(()=>tone(1040,.18),160)},wrong:()=>tone(190,.16,'sawtooth',.03)};

  function resetGame(){
    collected=new Set(); placed=new Set();
    player.x=70; player.y=platforms[0].y-player.h; player.vx=0; player.vy=0; player.onGround=true; player.state='idle'; player.frame=0; player.pickT=0;
    $$('.inv-slot').forEach(x=>x.classList.remove('collected'));
    $$('.organ-card').forEach(x=>x.classList.remove('placed'));
    $$('.target-zone').forEach(x=>x.classList.remove('correct'));
    $$('.placed-organ').forEach(x=>x.remove());
    $('#assembly-status').textContent='0 de 4 peças encaixadas';
    updateObjective();
  }
  function updateObjective(){
    const next=order.find(k=>!collected.has(k));
    const el=$('#objective');
    if(next) el.textContent=`Encontre: ${organMeta[next].label}`;
    else el.textContent='Leve as peças até a estação à direita ➜';
  }
  function startGame(){
    resetGame(); showScreen('#game-screen'); started=true; paused=false; last=performance.now();
    speak('Encontre as quatro peças anatômicas. Use os botões para andar e pular.');
    cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
  }

  function playerRect(){return {l:player.x-player.w/2,r:player.x+player.w/2,t:player.y,b:player.y+player.h};}
  function update(dt){
    if(paused) return;
    const speed=380;
    player.vx=(input.right?speed:0)-(input.left?speed:0);
    if(player.vx!==0) player.facing=Math.sign(player.vx);
    if(input.jump && player.onGround){ player.vy=-1150; player.onGround=false; sounds.jump(); input.jump=false; }
    if(player.pickT>0){ player.pickT-=dt; player.vx*=.15; }
    player.vy += 2200*dt;
    const prevBottom=player.y+player.h;
    player.x += player.vx*dt;
    player.x=Math.max(player.w/2,Math.min(W-player.w/2,player.x));
    player.y += player.vy*dt;
    player.onGround=false;
    const newBottom=player.y+player.h;
    if(player.vy>=0){
      for(const p of platforms){
        const within=player.x+player.w*.32>p.x && player.x-player.w*.32<p.x+p.w;
        if(within && prevBottom<=p.y+12 && newBottom>=p.y){
          player.y=p.y-player.h; player.vy=0; player.onGround=true; break;
        }
      }
    }
    if(player.y>H+100){player.x=80;player.y=platforms[0].y-player.h;player.vy=0;}

    // collectibles
    for(const key of order){
      if(collected.has(key)) continue;
      const o=organMeta[key];
      const dx=player.x-o.x, dy=(player.y+player.h*.55)-o.y;
      if(Math.hypot(dx,dy)<90){
        collected.add(key); player.pickT=.58; player.state='pick'; player.frame=0; player.frameT=0; sounds.collect();
        $(`.inv-slot[data-organ="${key}"]`).classList.add('collected');
        toast(`${o.label} encontrado! ✨`); speak(`${o.label} encontrado.`); updateObjective();
      }
    }
    if(collected.size===4 && player.x>1390 && player.onGround){
      openAssembly(); return;
    }
    // animation state
    if(player.pickT>0) player.state='pick';
    else if(!player.onGround) player.state='jump';
    else if(Math.abs(player.vx)>5) player.state='walk';
    else player.state='idle';
    animatePlayer(dt);
  }

  function animatePlayer(dt){
    const frames=player.state==='walk'?8:player.state==='jump'?6:player.state==='pick'?6:8;
    const fps=player.state==='walk'?11:player.state==='pick'?10:8;
    player.frameT+=dt;
    if(player.frameT>=1/fps){player.frameT=0;player.frame=(player.frame+1)%frames;}
    if(player.state==='jump'){
      // map vertical motion to jump phase for a more natural pose
      const phase=player.vy<-450?2:player.vy<80?3:player.vy<550?4:5; player.frame=phase;
    }
    if(player.state==='idle') player.frame=1;
  }

  function draw(){
    ctx.clearRect(0,0,W,H); ctx.drawImage(assets.images.bg,0,0,W,H);
    // collectibles
    const t=performance.now()/1000;
    for(const key of order){
      if(collected.has(key)) continue;
      const o=organMeta[key], img=assets.images[`organ_${key}`];
      const bob=Math.sin(t*3+o.x*.01)*7;
      ctx.save(); ctx.shadowColor='rgba(255,220,70,.95)'; ctx.shadowBlur=28;
      ctx.drawImage(img,o.x-o.size/2,o.y-o.size/2+bob,o.size,o.size); ctx.restore();
      ctx.save(); ctx.fillStyle='#fff7a8'; ctx.beginPath(); ctx.arc(o.x+o.size*.42,o.y-o.size*.35+bob,5+Math.sin(t*5)*2,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    // station marker
    if(collected.size===4){
      const pulse=1+Math.sin(t*5)*.06;
      ctx.save(); ctx.translate(1450,420); ctx.scale(pulse,pulse);
      ctx.fillStyle='rgba(11,103,200,.88)'; ctx.strokeStyle='#fff'; ctx.lineWidth=5;
      roundRect(ctx,-70,-38,140,76,20); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='900 24px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('MONTAR',0,0);ctx.restore();
    }
    drawPlayer();
  }
  function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):(c.rect(x,y,w,h));}
  function drawPlayer(){
    const state=player.state;
    const img=state==='walk'||state==='idle'?assets.images.walk:state==='jump'?assets.images.jump:state==='pick'?assets.images.pick:assets.images.walk;
    const frames=(state==='walk'||state==='idle')?8:6;
    const sw=img.width/frames, sh=img.height;
    const dw=player.w*2.45, dh=player.h*1.12; // sprite frame includes transparent side margins
    const dx=player.x-dw/2, dy=player.y-(dh-player.h);
    ctx.save();
    if(player.facing<0){ctx.translate(player.x*2,0);ctx.scale(-1,1);}
    ctx.drawImage(img,Math.floor(player.frame)%frames*sw,0,sw,sh,dx,dy,dw,dh);
    ctx.restore();
  }
  function loop(now){
    if(!started) return;
    const dt=Math.min(.034,(now-last)/1000||0); last=now;
    update(dt); draw(); raf=requestAnimationFrame(loop);
  }

  function openAssembly(){
    started=false; cancelAnimationFrame(raf); showScreen('#assembly-screen');
    speak('Agora arraste cada órgão para o lugar correto no corpo.');
  }

  // assembly drag and drop
  let drag=null;
  $$('.organ-card').forEach(card=>{
    card.addEventListener('pointerdown', e=>{
      if(card.classList.contains('placed')) return;
      e.preventDefault();
      const organ=card.dataset.organ;
      const ghost=document.createElement('img'); ghost.className='drag-ghost'; ghost.src=organMeta[organ].src; ghost.alt=''; document.body.appendChild(ghost);
      drag={organ,card,ghost,pointerId:e.pointerId}; moveGhost(e.clientX,e.clientY); card.setPointerCapture?.(e.pointerId);
    });
    card.addEventListener('pointermove', e=>{if(drag&&drag.pointerId===e.pointerId) moveGhost(e.clientX,e.clientY);});
    card.addEventListener('pointerup', e=>{if(drag&&drag.pointerId===e.pointerId) finishDrag(e.clientX,e.clientY);});
    card.addEventListener('pointercancel', ()=>cancelDrag());
  });
  window.addEventListener('pointermove',e=>{if(drag) moveGhost(e.clientX,e.clientY);},{passive:false});
  window.addEventListener('pointerup',e=>{if(drag) finishDrag(e.clientX,e.clientY);});
  function moveGhost(x,y){if(!drag)return; drag.ghost.style.left=`${x}px`;drag.ghost.style.top=`${y}px`;}
  function cancelDrag(){if(!drag)return;drag.ghost.remove();drag=null;}
  function finishDrag(x,y){
    if(!drag)return;
    const {organ,card,ghost}=drag; const zone=$(`.target-zone[data-organ="${organ}"]`); const r=zone.getBoundingClientRect();
    const cx=r.left+r.width/2, cy=r.top+r.height/2; const ok=Math.hypot(x-cx,y-cy) < Math.max(r.width,r.height)*.68;
    ghost.remove(); drag=null;
    if(ok){
      card.classList.add('placed'); zone.classList.add('correct'); placed.add(organ); sounds.correct();
      const img=document.createElement('img'); img.className='placed-organ'; img.dataset.organ=organ; img.src=organMeta[organ].src; img.alt=organMeta[organ].label;
      img.style.left=`${targetPlacement[organ].x}%`; img.style.top=`${targetPlacement[organ].y}%`; $('#body-wrap').appendChild(img);
      $('#assembly-status').textContent=`${placed.size} de 4 peças encaixadas`;
      speak(`${organMeta[organ].label}. Muito bem!`);
      if(placed.size===4) setTimeout(win,700);
    } else {
      sounds.wrong(); zone.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(1.12)'},{transform:'translate(-50%,-50%) scale(1)'}],{duration:350});
      $('#assembly-status').textContent=`Quase! Tente outro lugar. ${placed.size} de 4 encaixadas.`;
    }
  }
  function win(){
    showScreen('#win-screen'); sounds.correct(); speak('Parabéns! Corpo montado!');
    const conf=$('#confetti'); conf.innerHTML='';
    const colors=['#0b67c8','#ffc72c','#ef3d48','#53c86b','#9b63e6'];
    for(let i=0;i<70;i++){
      const p=document.createElement('i');p.className='confetti-piece';p.style.left=`${Math.random()*100}%`;p.style.background=colors[i%colors.length];p.style.setProperty('--dx',`${(Math.random()-.5)*380}px`);p.style.animationDelay=`${Math.random()*.9}s`;conf.appendChild(p);
    }
  }

  // Buttons & keys
  $('#play-btn').addEventListener('click',startGame);
  $('#how-btn').addEventListener('click',()=>showScreen('#how-screen'));
  $('#how-back').addEventListener('click',()=>showScreen('#start-screen'));
  $('#replay-btn').addEventListener('click',startGame);
  $('#home-btn').addEventListener('click',()=>{started=false;cancelAnimationFrame(raf);showScreen('#start-screen');});
  $('#assembly-help').addEventListener('click',()=>speak('Arraste cada órgão até a região correta do corpo.'));
  $('#sound-btn').addEventListener('click',()=>{soundOn=!soundOn;$('#sound-btn').textContent=soundOn?'🔊':'🔇';$('#sound-btn').setAttribute('aria-label',soundOn?'Som ligado':'Som desligado');if(!soundOn&&'speechSynthesis'in window)speechSynthesis.cancel();});
  $('#pause-btn').addEventListener('click',()=>{paused=true;$('#pause-modal').hidden=false;});
  $('#resume-btn').addEventListener('click',()=>{paused=false;$('#pause-modal').hidden=true;last=performance.now();});
  $('#restart-btn').addEventListener('click',()=>{$('#pause-modal').hidden=true;paused=false;resetGame();last=performance.now();});
  $('#pause-home-btn').addEventListener('click',()=>{$('#pause-modal').hidden=true;paused=false;started=false;cancelAnimationFrame(raf);showScreen('#start-screen');});

  function bindHold(id,key){
    const b=$(id); const on=e=>{e.preventDefault();input[key]=true;b.classList.add('pressed');}; const off=e=>{e?.preventDefault();input[key]=false;b.classList.remove('pressed');};
    b.addEventListener('pointerdown',on); b.addEventListener('pointerup',off); b.addEventListener('pointercancel',off); b.addEventListener('pointerleave',e=>{if(e.buttons===0)off(e)});
  }
  bindHold('#left-btn','left');bindHold('#right-btn','right');
  $('#jump-btn').addEventListener('pointerdown',e=>{e.preventDefault();input.jump=true;$('#jump-btn').classList.add('pressed')});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>$('#jump-btn').addEventListener(ev,e=>{e.preventDefault();input.jump=false;$('#jump-btn').classList.remove('pressed')}));
  window.addEventListener('keydown',e=>{
    if(['ArrowLeft','a','A'].includes(e.key)){input.left=true;e.preventDefault();}
    if(['ArrowRight','d','D'].includes(e.key)){input.right=true;e.preventDefault();}
    if(['ArrowUp','w','W',' '].includes(e.key)){input.jump=true;e.preventDefault();}
    if(e.key==='Escape'&&started){paused=!paused;$('#pause-modal').hidden=!paused;}
  });
  window.addEventListener('keyup',e=>{if(['ArrowLeft','a','A'].includes(e.key))input.left=false;if(['ArrowRight','d','D'].includes(e.key))input.right=false;if(['ArrowUp','w','W',' '].includes(e.key))input.jump=false;});

  // PWA install
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#install-btn').hidden=false;});
  $('#install-btn').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#install-btn').hidden=true;});
  window.addEventListener('appinstalled',()=>{$('#install-btn').hidden=true;});
  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}

  loadImages().then(()=>{draw();}).catch(()=>{alert('Não foi possível carregar os arquivos do jogo. Recarregue a página.');});
})();
