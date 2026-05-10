const game=document.getElementById("game"),ctx=game.getContext("2d");
const sonarCanvas=document.getElementById("sonar"),sonarCtx=sonarCanvas.getContext("2d");
const radarCanvas=document.getElementById("radar"),radarCtx=radarCanvas.getContext("2d");
const shipView=document.getElementById("shipView"),shipCtx=shipView.getContext("2d");
const consolePanel=document.getElementById("console"),sonarButton=document.getElementById("sonarButton"),sonarStatus=document.getElementById("sonarStatus"),radarStatus=document.getElementById("radarStatus");
const radarBtn=document.getElementById("radarBtn"),windBtn=document.getElementById("windBtn"),infoBtn=document.getElementById("infoBtn");
const speedRead=document.getElementById("speedRead"),rudderRead=document.getElementById("rudderRead"),courseRead=document.getElementById("courseRead"),weaponRead=document.getElementById("weaponRead"),windShort=document.getElementById("windShort");

const WORLD_W=30000,WORLD_H=30000,KNOT_TO_MS=.514444,MS_TO_KNOT=1/KNOT_TO_MS,SIM_SPEED=10;
let METERS_PER_PIXEL=42,baseMetersPerPixel=42,zoom=1,MIN_ZOOM=.35,MAX_ZOOM=120;
const keys=new Set(),handled=new Set();
const speedOrders=[
  {name:"WSTECZ 2/3",knots:-12},{name:"WSTECZ 1/3",knots:-6},{name:"STOP",knots:0},
  {name:"1/3",knots:10},{name:"2/3",knots:20},{name:"CAŁA",knots:30},{name:"FLANKA",knots:37}
]; speedOrders.forEach(o=>o.value=o.knots*KNOT_TO_MS); const STOP_INDEX=2;

const ship={x:WORLD_W/2,y:WORLD_H*.62,heading:degToRad(0),speed:0,targetSpeedIndex:STOP_INDEX,rudder:0,maxRudder:30,orderedCourse:null,autopilot:false};
const camera={x:0,y:0,anchorX:.5,anchorY:.5,manualOffsetX:0,manualOffsetY:0};
const sonar={on:false,range:2500,minRange:300,bearing:degToRad(0),beamWidth:degToRad(14),ping:0};
const radar={on:true,range:9500,sweepAngle:0};
const weather={t:0,rain:.28,wave:.34,windDir:degToRad(305),windSpeed:14.5,visibility:5200};
const guns={mode:"MANUAL",bearing:degToRad(0),range:4500,minRange:1200,maxRange:16460,muzzleVelocity:792,turnRate:28.75*Math.PI/180};

const turrets=[
  {name:"A",x:46,y:0,arc:[-150,150],reload:0,baseReload:4.0},
  {name:"B",x:30,y:0,arc:[-150,150],reload:.7,baseReload:4.2},
  {name:"Q",x:-18,y:0,arc:[-175,175],reload:1.4,baseReload:4.0},
  {name:"X",x:-39,y:0,arc:[30,330],reload:2.1,baseReload:4.3},
  {name:"Y",x:-55,y:0,arc:[30,330],reload:2.8,baseReload:4.1}
];

let target=randomTarget(),lastRadarContact=null,lastRadarAirContact=null,inputMode="COURSE",courseInput="",angleInput="",lastMessage="Gotowy.";
let windLayerOn=true,infoOn=true,audioCtx=null,lastTime=performance.now(),wakeBuild=0;
const shells=[],splashes=[],muzzleFlashes=[],wake=[],radarEchoes=[],sonarPulses=[],smoke=[],aaTracers=[],aaBursts=[],wrecks=[];
const aircraft=Array.from({length:3},(_,i)=>makeCondor(i));
const subs=Array.from({length:3},()=>makeSub());
const rainDrops=Array.from({length:130},()=>({x:Math.random(),y:Math.random(),s:.55+Math.random()*1.25}));
const drag={active:false,lastX:0,lastY:0};

resizeAll(); bindEvents(); requestAnimationFrame(loop);

function bindEvents(){
  window.addEventListener("resize",resizeAll);
  sonarButton.onclick=()=>{ensureAudio();sonar.on=!sonar.on;sonar.ping=0;};
  radarBtn.onclick=()=>{radar.on=!radar.on;radarBtn.textContent=radar.on?"RADAR: WŁ.":"RADAR: WYŁ.";radarBtn.classList.toggle("on",radar.on);};
  windBtn.onclick=()=>{windLayerOn=!windLayerOn;windBtn.textContent=windLayerOn?"WIATR: WŁ.":"WIATR: WYŁ.";windBtn.classList.toggle("on",windLayerOn);};
  infoBtn.onclick=()=>{infoOn=!infoOn;infoBtn.textContent=infoOn?"INFO: WŁ.":"INFO: WYŁ.";infoBtn.classList.toggle("on",infoOn);};

  game.addEventListener("wheel",e=>{
    e.preventDefault();
    const rect=game.getBoundingClientRect(),dpr=Math.max(1,Math.min(2,devicePixelRatio||1));
    const m={x:(e.clientX-rect.left)*dpr,y:(e.clientY-rect.top)*dpr};
    updateMapScale(); const before={x:camera.x+m.x*METERS_PER_PIXEL,y:camera.y+m.y*METERS_PER_PIXEL};
    zoom=clamp(zoom*Math.exp(-e.deltaY*.0012),MIN_ZOOM,MAX_ZOOM); updateMapScale();
    camera.x=before.x-m.x*METERS_PER_PIXEL; camera.y=before.y-m.y*METERS_PER_PIXEL;
    camera.manualOffsetX=camera.x-(ship.x-game.width*METERS_PER_PIXEL*camera.anchorX);
    camera.manualOffsetY=camera.y-(ship.y-game.height*METERS_PER_PIXEL*camera.anchorY);
  },{passive:false});
  game.addEventListener("mousedown",e=>{if(e.button!==0)return;drag.active=true;drag.lastX=e.clientX;drag.lastY=e.clientY;game.classList.add("dragging");});
  window.addEventListener("mousemove",e=>{if(!drag.active)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;drag.lastX=e.clientX;drag.lastY=e.clientY;camera.manualOffsetX-=dx*METERS_PER_PIXEL;camera.manualOffsetY-=dy*METERS_PER_PIXEL;});
  window.addEventListener("mouseup",()=>{drag.active=false;game.classList.remove("dragging");});
  game.addEventListener("dblclick",()=>{camera.manualOffsetX=0;camera.manualOffsetY=0;});
  window.addEventListener("keydown",onKeyDown); window.addEventListener("keyup",e=>{keys.delete(e.key.toLowerCase());handled.delete(e.key.toLowerCase());});
}
function onKeyDown(e){
  const k=e.key.toLowerCase(); keys.add(k);
  if(["arrowup","arrowdown","arrowleft","arrowright"," ","+","-"].includes(k)) e.preventDefault();
  if(/^[0-9]$/.test(e.key)){ if(inputMode==="AIM") angleInput=(angleInput+e.key).slice(-3); else courseInput=(courseInput+e.key).slice(-3); }
  if(e.key==="Enter"){
    if(inputMode==="AIM"&&angleInput){guns.bearing=degToRad(Number(angleInput)%360);angleInput="";}
    else if(inputMode==="COURSE"&&courseInput){ship.orderedCourse=(Number(courseInput)%360+360)%360;ship.autopilot=true;courseInput="";}
  }
}
function once(k){if(keys.has(k)&&!handled.has(k)){handled.add(k);return true}return false}
function resizeCanvas(c){const r=c.getBoundingClientRect(),dpr=Math.max(1,Math.min(2,devicePixelRatio||1));const w=Math.max(10,Math.floor(r.width*dpr)),h=Math.max(10,Math.floor(r.height*dpr));if(c.width!==w||c.height!==h){c.width=w;c.height=h}}
function resizeAll(){[game,sonarCanvas,radarCanvas,shipView].forEach(resizeCanvas)}
function degToRad(d){return(d-90)*Math.PI/180} function radToCourse(r){return(((r*180/Math.PI)+90)%360+360)%360}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))} function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function angleDiffRad(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b))} function angleToPoint(a,b){return Math.atan2(b.y-a.y,b.x-a.x)}
function angleDiffDeg(t,c){return((t-c+540)%360)-180}
function updateMapScale(){const minPx=Math.min(game.width,game.height)*.43;baseMetersPerPixel=radar.range/Math.max(120,minPx);METERS_PER_PIXEL=baseMetersPerPixel/zoom}
function updateCamera(){updateMapScale();camera.x=ship.x-game.width*METERS_PER_PIXEL*camera.anchorX+camera.manualOffsetX;camera.y=ship.y-game.height*METERS_PER_PIXEL*camera.anchorY+camera.manualOffsetY}
function worldToScreen(p){return{x:(p.x-camera.x)/METERS_PER_PIXEL,y:(p.y-camera.y)/METERS_PER_PIXEL}}

function ensureAudio(){if(!audioCtx)audioCtx=new(AudioContext||webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume()}
function blip(f=800,d=.08,v=.12,type="square"){if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(f,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(40,f*.62),audioCtx.currentTime+d);g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(v,audioCtx.currentTime+.005);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+d);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+d+.02)}
function burst(d=.25,v=.22,ff=420){if(!audioCtx)return;const b=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*d),audioCtx.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const s=audioCtx.createBufferSource(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();s.buffer=b;f.type="lowpass";f.frequency.value=ff;g.gain.setValueAtTime(v,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+d);s.connect(f).connect(g).connect(audioCtx.destination);s.start()}

function randomTarget(){const d=3200+Math.random()*5200,a=Math.random()*Math.PI*2;return{x:(ship.x+Math.cos(a)*d+WORLD_W)%WORLD_W,y:(ship.y+Math.sin(a)*d+WORLD_H)%WORLD_H,length:135,beam:18,heading:Math.random()*Math.PI*2,speed:1.0+Math.random()*2.5,hp:100,maxHp:100,alive:true,turn:5}}
function makeCondor(i=0){return{active:true,x:-3500-i*4200,y:2500+Math.random()*WORLD_H*.5,heading:degToRad(24+Math.random()*16),speed:86+Math.random()*12,hp:24,maxHp:24,aa:0,damaged:false}}
function makeSub(){const d=1800+Math.random()*3800,a=Math.random()*Math.PI*2;return{x:(ship.x+Math.cos(a)*d+WORLD_W)%WORLD_W,y:(ship.y+Math.sin(a)*d+WORLD_H)%WORLD_H,heading:Math.random()*Math.PI*2,speed:1.2+Math.random()*1.5,alive:true}}

function updateOrders(dt){
  if(once("arrowup")||once("w")||once("+")) ship.targetSpeedIndex=clamp(ship.targetSpeedIndex+1,0,speedOrders.length-1);
  if(once("arrowdown")||once("s")||once("-")) ship.targetSpeedIndex=clamp(ship.targetSpeedIndex-1,0,speedOrders.length-1);
  if(once("arrowleft")||once("a")){ship.rudder=clamp(ship.rudder-5,-ship.maxRudder,ship.maxRudder);ship.autopilot=false;ship.orderedCourse=null}
  if(once("arrowright")||once("d")){ship.rudder=clamp(ship.rudder+5,-ship.maxRudder,ship.maxRudder);ship.autopilot=false;ship.orderedCourse=null}
  if(once("z"))ship.rudder=0; if(once("x"))ship.targetSpeedIndex=STOP_INDEX;
  if(once("p")){ensureAudio();sonar.on=!sonar.on;sonar.ping=0}
  if(keys.has("[")||keys.has("{")) sonar.bearing-=.9*dt; if(keys.has("]")||keys.has("}")) sonar.bearing+=.9*dt;
  if(once("g")){guns.mode="MANUAL";inputMode=inputMode==="AIM"?"COURSE":"AIM"}
  if(once("f")){guns.mode=guns.mode==="AUTO"?"MANUAL":"AUTO"}
  if(once("r")){guns.mode="MANUAL";guns.bearing=ship.heading;turrets.forEach((t,i)=>t.reload=i*.5);lastMessage="Działa zresetowane do pozycji początkowej."}
  let turn=0;if(keys.has(",")||keys.has("<"))turn-=guns.turnRate*dt;if(keys.has(".")||keys.has(">"))turn+=guns.turnRate*dt;
  if(turn){guns.mode="MANUAL";guns.bearing+=turn}
  if(keys.has("o"))guns.range=clamp(guns.range+520*dt,guns.minRange,guns.maxRange);
  if(keys.has("l"))guns.range=clamp(guns.range-520*dt,guns.minRange,guns.maxRange);
  if(once(" ")) fireGuns();
  if(guns.mode==="AUTO"&&target.alive) guns.bearing+=clamp(angleDiffRad(angleToPoint(ship,target),guns.bearing),-guns.turnRate*dt,guns.turnRate*dt);
}
function updatePhysics(dt){
  const targetSpeed=speedOrders[ship.targetSpeedIndex].value,acc=Math.abs(targetSpeed)>Math.abs(ship.speed)?.55:.82;
  ship.speed+=clamp(targetSpeed-ship.speed,-acc*dt,acc*dt);
  if(ship.autopilot&&ship.orderedCourse!==null){const diff=angleDiffDeg(ship.orderedCourse,radToCourse(ship.heading));ship.rudder=clamp(diff*.16,-15,15);if(Math.abs(diff)<1.2){ship.rudder=0;ship.heading=degToRad(ship.orderedCourse);ship.autopilot=false}}
  ship.heading+=(ship.rudder/ship.maxRudder)*(Math.abs(ship.speed)/speedOrders.at(-1).value)*.105*dt*Math.sign(ship.speed||1);
  const windAngle=angleDiffRad(weather.windDir,ship.heading),headWind=Math.cos(windAngle)*weather.windSpeed,crossWind=Math.sin(windAngle)*weather.windSpeed;
  const actualSpeed=(ship.speed-headWind*.010-weather.wave*.10*Math.sign(ship.speed||1))*SIM_SPEED;
  ship.x+=Math.cos(ship.heading)*actualSpeed*dt+Math.cos(weather.windDir)*crossWind*.010*SIM_SPEED*dt;
  ship.y+=Math.sin(ship.heading)*actualSpeed*dt+Math.sin(weather.windDir)*crossWind*.010*SIM_SPEED*dt;
  ship.x=(ship.x+WORLD_W)%WORLD_W;ship.y=(ship.y+WORLD_H)%WORLD_H;
  wakeBuild=clamp(wakeBuild+(Math.abs(ship.speed)>.5?.7:-1.4)*dt,0,1); if(wakeBuild>.05)addWake(dt);
  if(Math.random()<dt*4&&Math.abs(ship.speed)>.4)smoke.push({x:ship.x-Math.cos(ship.heading)*22,y:ship.y-Math.sin(ship.heading)*22,t:0,r:4+Math.random()*3});
}
function updateTargets(dt){
  if(target.alive){target.turn-=dt;if(target.turn<=0){target.heading+=(Math.random()-.5)*degToRad(34);target.speed=clamp(target.speed+(Math.random()-.5)*1.2,1,5.4);target.turn=5+Math.random()*12}target.x=(target.x+Math.cos(target.heading)*target.speed*dt*4+WORLD_W)%WORLD_W;target.y=(target.y+Math.sin(target.heading)*target.speed*dt*4+WORLD_H)%WORLD_H}
  for(const sub of subs){sub.x=(sub.x+Math.cos(sub.heading)*sub.speed*dt*5+WORLD_W)%WORLD_W;sub.y=(sub.y+Math.sin(sub.heading)*sub.speed*dt*5+WORLD_H)%WORLD_H;if(Math.random()<dt*.035)sub.heading+=(Math.random()-.5)*.5}
  for(let i=0;i<aircraft.length;i++){const p=aircraft[i];p.x+=Math.cos(p.heading)*p.speed*dt*SIM_SPEED;p.y+=Math.sin(p.heading)*p.speed*dt*SIM_SPEED;if(p.x>WORLD_W+3500||p.y>WORLD_H+2500||p.hp<=0)Object.assign(p,makeCondor(i));updateAA(p,dt)}
}
function addWake(dt){wake.push({x:ship.x-Math.cos(ship.heading)*68,y:ship.y-Math.sin(ship.heading)*68,t:0,heading:ship.heading,intensity:clamp(Math.abs(ship.speed)/speedOrders.at(-1).value,.1,.75)*wakeBuild});while(wake.length>420)wake.shift()}
function updateWakeSmoke(dt){for(const w of wake)w.t+=dt;while(wake.length&&wake[0].t>65)wake.shift();for(const s of smoke){s.t+=dt;s.x+=Math.cos(weather.windDir)*weather.windSpeed*.9*dt;s.y+=Math.sin(weather.windDir)*weather.windSpeed*.9*dt;s.r+=.8*dt}while(smoke.length&&smoke[0].t>18)smoke.shift()}
function updateAA(p,dt){p.aa-=dt;const d=dist(ship,p);if(d>3810||p.aa>0)return;p.aa=.12;const muzzle={x:ship.x+Math.cos(ship.heading)*(12-Math.random()*45),y:ship.y+Math.sin(ship.heading)*(12-Math.random()*45)},spread=80+d*.035,hit=Math.random()<(d<2000?.10:.035);const end=hit?p:{x:p.x+(Math.random()-.5)*spread,y:p.y+(Math.random()-.5)*spread};aaTracers.push({x1:muzzle.x,y1:muzzle.y,x2:end.x,y2:end.y,t:0,maxT:.22});aaBursts.push({x:end.x,y:end.y,t:0,maxT:hit?.55:.36});if(hit){const dmg=7+Math.random()*6;p.hp-=dmg;p.damaged=true;blip(420,.05,.06,"square")}}
function nearestSonarContact(){let best=null,bd=Infinity;for(const s of subs){const d=dist(ship,s);if(d<sonar.minRange||d>sonar.range)continue;const diff=Math.abs(angleDiffRad(angleToPoint(ship,s),sonar.bearing+ship.heading));if(diff<sonar.beamWidth/2&&d<bd){best=s;bd=d}}return best}
function updateSonar(dt){sonar.ping-=dt;if(!sonar.on)return;if(sonar.ping<=0){const c=nearestSonarContact();sonarPulses.push({x:ship.x,y:ship.y,angle:sonar.bearing+ship.heading,t:0});blip(c?520:1560,.14,c?.16:.12,c?"triangle":"square");sonar.ping=2.4}}
function updateRadar(dt){if(!radar.on)return;if(lastRadarContact)lastRadarContact.age+=dt;if(lastRadarAirContact)lastRadarAirContact.age+=dt;radar.sweepAngle=(radar.sweepAngle+dt*Math.PI*2/5.8)%(Math.PI*2);checkRadar(target,"surface");for(const p of aircraft)checkRadar(p,"air");for(let i=radarEchoes.length-1;i>=0;i--){radarEchoes[i].t+=dt;if(radarEchoes[i].t>1.1)radarEchoes.splice(i,1)}}
function checkRadar(o,kind){if(!o||o.alive===false||o.active===false)return;const r=dist(ship,o);if(r>radar.range)return;const b=angleToPoint(ship,o),tol=.035+Math.min(.018,r/radar.range*.018);if(Math.abs(angleDiffRad(b,radar.sweepAngle))<tol){radarEchoes.push({x:o.x,y:o.y,t:0,kind});if(kind==="surface")lastRadarContact={bearing:radToCourse(b),range:Math.round(r),age:0};else lastRadarAirContact={bearing:radToCourse(b),range:Math.round(r),age:0};blip(kind==="air"?1620:1320,.045,.08,"square")}}
function ballisticFlightTime(r){const v=guns.muzzleVelocity,g=9.81,ratio=clamp(r*g/(v*v),.01,.95),a=Math.asin(ratio)/2;return(2*v*Math.sin(a))/g}
function fireGuns(){ensureAudio();for(const t of turrets){if(t.reload>0)continue;if(!turretCanFire(t,guns.bearing))continue;const start=turretWorldPos(t),aim=getAimPoint(),flight=ballisticFlightTime(guns.range);shells.push({startX:start.x,startY:start.y,endX:aim.x,endY:aim.y,x:start.x,y:start.y,z:0,t:0,flightTime:flight,turret:t.name});muzzleFlashes.push({x:start.x,y:start.y,angle:guns.bearing,t:0});t.reload=t.baseReload+(Math.random()-.5)*.8;blip(92,.16,.20,"square");burst(.18,.20,260);break}}
function turretCanFire(t,bearing){const rel=(radToCourse(bearing-ship.heading)+360)%360,lo=(t.arc[0]+360)%360,hi=(t.arc[1]+360)%360;return lo<hi?rel>=lo&&rel<=hi:rel>=lo||rel<=hi}
function turretWorldPos(t){return{x:ship.x+Math.cos(ship.heading)*t.x-Math.sin(ship.heading)*t.y,y:ship.y+Math.sin(ship.heading)*t.x+Math.cos(ship.heading)*t.y}}
function getAimPoint(){return{x:ship.x+Math.cos(guns.bearing)*guns.range,y:ship.y+Math.sin(guns.bearing)*guns.range}}
function updateProjectiles(dt){for(const t of turrets)t.reload=Math.max(0,t.reload-dt);for(let i=shells.length-1;i>=0;i--){const s=shells[i];s.t+=dt;const p=clamp(s.t/s.flightTime,0,1);s.x=s.startX+(s.endX-s.startX)*p;s.y=s.startY+(s.endY-s.startY)*p;s.z=Math.sin(p*Math.PI)*260;if(p>=1){const hit=target.alive&&Math.hypot(s.endX-target.x,s.endY-target.y)<58;splashes.push({x:s.endX,y:s.endY,t:0,maxT:hit?1.4:1,hit});if(hit){const dmg=42+Math.random()*18;target.hp=Math.max(0,target.hp-dmg);lastMessage=`Trafienie ${s.turret}: -${Math.round(dmg)} HP, cel ${Math.round(target.hp)} HP.`;if(target.hp<=0){wrecks.push({...target,t:0});target.alive=false;setTimeout(()=>target=randomTarget(),10000)}}shells.splice(i,1)}}for(let i=splashes.length-1;i>=0;i--){splashes[i].t+=dt;if(splashes[i].t>splashes[i].maxT)splashes.splice(i,1)}for(let i=muzzleFlashes.length-1;i>=0;i--){muzzleFlashes[i].t+=dt;if(muzzleFlashes[i].t>.18)muzzleFlashes.splice(i,1)}for(let i=aaTracers.length-1;i>=0;i--){aaTracers[i].t+=dt;if(aaTracers[i].t>aaTracers[i].maxT)aaTracers.splice(i,1)}for(let i=aaBursts.length-1;i>=0;i--){aaBursts[i].t+=dt;if(aaBursts[i].t>aaBursts[i].maxT)aaBursts.splice(i,1)}}

function draw(){resizeAll();updateCamera();game.classList.toggle("aiming",inputMode==="AIM");drawOcean();drawOverlays();drawWrecks();drawTarget();drawSubs();drawRadarSweep();drawSonarCone();drawSensorEffects();drawEffects();drawAircraft();drawAA();drawSmoke();const sp=worldToScreen(ship);drawFletcher(ctx,sp.x,sp.y,ship.heading,clamp(.18*Math.sqrt(zoom),.18,9),true);drawBoxes();drawHud();drawScopes();drawShipPanel()}
function drawOcean(){const w=game.width,h=game.height,g=ctx.createRadialGradient(w*.52,h*.44,40,w*.52,h*.44,Math.max(w,h));g.addColorStop(0,"#1f3f4a");g.addColorStop(.55,"#14313c");g.addColorStop(1,"#071923");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);drawGrid();drawWaves();drawVisibility();drawWake();drawRain();drawWind()}
function drawGrid(){const step=10000,w=game.width,h=game.height;ctx.save();ctx.strokeStyle="rgba(220,230,215,.18)";ctx.lineWidth=1;for(let wx=Math.floor(camera.x/step)*step;wx<=camera.x+w*METERS_PER_PIXEL+step;wx+=step){const sx=(wx-camera.x)/METERS_PER_PIXEL;ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,h);ctx.stroke()}for(let wy=Math.floor(camera.y/step)*step;wy<=camera.y+h*METERS_PER_PIXEL+step;wy+=step){const sy=(wy-camera.y)/METERS_PER_PIXEL;ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(w,sy);ctx.stroke()}ctx.restore()}
function drawWaves(){const w=game.width,h=game.height;ctx.save();ctx.strokeStyle=`rgba(182,205,210,${.04+weather.wave*.04})`;ctx.lineWidth=1;const spacing=85,seg=120,amp=.45+weather.wave*1.35;for(let wy=Math.floor(camera.y/spacing)*spacing;wy<=camera.y+h*METERS_PER_PIXEL+spacing;wy+=spacing){for(let wx=Math.floor(camera.x/seg)*seg;wx<=camera.x+w*METERS_PER_PIXEL+seg;wx+=seg){const sx=(wx-camera.x)/METERS_PER_PIXEL,sy=(wy-camera.y)/METERS_PER_PIXEL,len=Math.max(5,Math.min(22,seg/METERS_PER_PIXEL*.28)),y=sy+Math.sin((wx+wy*.7)*.012)*amp;ctx.beginPath();ctx.moveTo(sx-len*.5,y);ctx.quadraticCurveTo(sx,y-amp*.7,sx+len*.5,y);ctx.stroke()}}ctx.restore()}
function drawVisibility(){const s=worldToScreen(ship),r=weather.visibility/METERS_PER_PIXEL;ctx.save();ctx.strokeStyle="rgba(207,215,178,.70)";ctx.setLineDash([10,8]);ctx.beginPath();ctx.arc(s.x,s.y,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);const g=ctx.createRadialGradient(s.x,s.y,r*.96,s.x,s.y,Math.max(r*1.18,Math.max(game.width,game.height)*1.05));g.addColorStop(0,"rgba(190,196,182,0)");g.addColorStop(.10,"rgba(190,196,182,.16)");g.addColorStop(.30,"rgba(190,196,182,.30)");g.addColorStop(1,"rgba(190,196,182,.42)");ctx.fillStyle=g;ctx.fillRect(0,0,game.width,game.height);ctx.restore()}
function drawWind(){if(!windLayerOn)return;const spacing=280,dx=Math.cos(weather.windDir),dy=Math.sin(weather.windDir),px=-dy,py=dx,off=(weather.t*weather.windSpeed*.35)%spacing;ctx.save();ctx.globalAlpha=.18;ctx.strokeStyle="#c0cab8";ctx.fillStyle="#c0cab8";ctx.lineWidth=1;for(let y=-2;y<game.height/spacing+3;y++)for(let x=-2;x<game.width/spacing+3;x++){const bx=x*spacing+px*y*22+dx*off,by=y*spacing+py*x*12+dy*off,sx=((bx%(game.width+spacing))+(game.width+spacing))%(game.width+spacing)-spacing/2,sy=((by%(game.height+spacing))+(game.height+spacing))%(game.height+spacing)-spacing/2,len=28;ctx.beginPath();ctx.moveTo(sx-dx*len*.5,sy-dy*len*.5);ctx.lineTo(sx+dx*len*.5,sy+dy*len*.5);ctx.stroke();ctx.beginPath();ctx.moveTo(sx+dx*len*.5,sy+dy*len*.5);ctx.lineTo(sx+dx*len*.22+px*5,sy+dy*len*.22+py*5);ctx.lineTo(sx+dx*len*.22-px*5,sy+dy*len*.22-py*5);ctx.fill()}ctx.restore()}
function drawWake(){ctx.save();for(const m of wake){const p=worldToScreen(m),life=clamp(1-m.t/65,0,1),len=(90+m.t*18)/METERS_PER_PIXEL,spread=(15+m.t*4)/METERS_PER_PIXEL;ctx.globalAlpha=.20*life*m.intensity;ctx.strokeStyle="rgba(220,235,225,.70)";ctx.lineWidth=Math.max(.8,1.8*life);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(m.heading);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-len,-spread);ctx.moveTo(0,0);ctx.lineTo(-len,spread);ctx.stroke();ctx.restore()}ctx.globalAlpha=1;ctx.restore()}
function drawRain(){ctx.save();ctx.strokeStyle=`rgba(210,225,220,${.018+weather.rain*.03})`;for(let i=0;i<rainDrops.length;i+=2){const r=rainDrops[i],x=((r.x*game.width+weather.t*weather.windSpeed*8*r.s)%(game.width+80))-40,y=((r.y*game.height+weather.t*90*r.s)%(game.height+80))-40;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(weather.windDir)*10*r.s,y+(Math.sin(weather.windDir)*10+7)*r.s);ctx.stroke()}ctx.restore()}
function drawOverlays(){drawRangeCircles();drawPredictedTrack();drawArrow(ship,ship.heading,900,"kurs","rgba(225,235,225,.85)");drawGunnery()}
function drawRangeCircles(){const s=worldToScreen(ship);function c(r,col,d=[],lw=1.6){ctx.save();ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.setLineDash(d);ctx.beginPath();ctx.arc(s.x,s.y,r/METERS_PER_PIXEL,0,Math.PI*2);ctx.stroke();ctx.restore()}c(sonar.range,"rgba(111,226,93,.82)",[9,5]);c(radar.range,"rgba(74,182,255,.95)",[9,5],2.2);c(guns.maxRange,"rgba(217,170,42,.9)",[10,5]);c(weather.visibility,"rgba(207,215,178,.75)",[10,8]);if(infoOn){label(`RADAR ${radar.range}m`,radar.range,40,"#4ab6ff");label(`SONAR ${sonar.range}m`,sonar.range,140,"#6fe25d");label(`DZIAŁA ${guns.maxRange}m`,guns.maxRange,220,"#d9aa2a");label(`WIDZ. ${Math.round(weather.visibility)}m`,weather.visibility,80,"#cfd7b2")}}
function label(txt,r,deg,col){const s=worldToScreen(ship),x=s.x+Math.cos(degToRad(deg))*r/METERS_PER_PIXEL,y=s.y+Math.sin(degToRad(deg))*r/METERS_PER_PIXEL;ctx.save();ctx.font="bold 13px Courier New";ctx.fillStyle="rgba(5,8,6,.72)";ctx.strokeStyle=col;const w=ctx.measureText(txt).width+12;roundRect(ctx,x+8,y-18,w,22,5);ctx.fill();ctx.stroke();ctx.fillStyle=col;ctx.fillText(txt,x+14,y-3);ctx.restore()}
function drawPredictedTrack(){if(Math.abs(ship.speed)<.3)return;let x=ship.x,y=ship.y,h=ship.heading;const pts=[];for(let t=0;t<=30;t+=2){h+=(ship.rudder/ship.maxRudder)*(Math.abs(ship.speed)/speedOrders.at(-1).value)*.105*2*Math.sign(ship.speed||1);x+=Math.cos(h)*ship.speed*SIM_SPEED*2;y+=Math.sin(h)*ship.speed*SIM_SPEED*2;pts.push(worldToScreen({x,y}))}ctx.save();ctx.strokeStyle="rgba(255,196,80,.42)";ctx.setLineDash([5,8]);ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();ctx.restore()}
function drawArrow(o,a,l,txt,col){const s=worldToScreen(o),len=l/METERS_PER_PIXEL;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(a);ctx.strokeStyle=col;ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len,0);ctx.stroke();ctx.beginPath();ctx.moveTo(len,0);ctx.lineTo(len-10,-5);ctx.lineTo(len-10,5);ctx.fill();ctx.restore()}
function drawGunnery(){const aim=getAimPoint(),s=worldToScreen(ship),a=worldToScreen(aim);ctx.save();ctx.strokeStyle="rgba(217,170,42,.85)";ctx.setLineDash([7,7]);ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(a.x,a.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(a.x,a.y,13,0,Math.PI*2);ctx.stroke();ctx.restore();if(infoOn){ctx.save();ctx.font="bold 14px Courier New";ctx.fillStyle="#d9aa2a";ctx.fillText(`POCISK ${ballisticFlightTime(guns.range).toFixed(1)}s`,a.x+18,a.y+28);ctx.fillText(`ODL ${target.alive?Math.round(Math.hypot(aim.x-target.x,aim.y-target.y)):"---"}m`,a.x+18,a.y+46);ctx.restore()}}
function drawRadarSweep(){if(!radar.on)return;const s=worldToScreen(ship),len=radar.range/METERS_PER_PIXEL;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(radar.sweepAngle);const g=ctx.createLinearGradient(0,0,len,0);g.addColorStop(0,"rgba(74,182,255,.16)");g.addColorStop(.72,"rgba(74,182,255,.54)");g.addColorStop(1,"rgba(74,182,255,.02)");ctx.strokeStyle=g;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len,0);ctx.stroke();ctx.restore()}
function drawSonarCone(){if(!sonar.on)return;const s=worldToScreen(ship),ang=sonar.bearing+ship.heading,r=sonar.range/METERS_PER_PIXEL,half=sonar.beamWidth/2;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(ang);const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,"rgba(111,226,93,.105)");g.addColorStop(.45,"rgba(111,226,93,.052)");g.addColorStop(1,"rgba(111,226,93,.010)");ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,0);for(let a=-half;a<=half+.001;a+=sonar.beamWidth/30)ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.closePath();ctx.fill();const phase=(weather.t*420)%sonar.range;for(let k=0;k<3;k++){const rr=((phase+k*sonar.range/3)%sonar.range)/METERS_PER_PIXEL;ctx.strokeStyle=`rgba(111,226,93,${.34*(1-rr/r)})`;ctx.lineWidth=2;ctx.beginPath();for(let a=-half;a<=half+.001;a+=sonar.beamWidth/32){const x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(a===-half)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()}ctx.restore()}
function drawSensorEffects(){for(const e of radarEchoes){const p=worldToScreen(e);ctx.save();ctx.strokeStyle=e.kind==="air"?`rgba(120,210,255,${1-e.t/1.1})`:`rgba(74,182,255,${1-e.t/1.1})`;ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(p.x,p.y,8+e.t*34,0,Math.PI*2);ctx.stroke();ctx.restore()}}
function drawTarget(){if(!target.alive)return;drawFreighter(ctx,target)}
function drawWrecks(){wrecks.forEach(w=>{ctx.save();ctx.globalAlpha=.62;drawFreighter(ctx,w,true);ctx.restore()})}
function drawFreighter(c,o,wreck=false){const p=worldToScreen(o),sc=1/METERS_PER_PIXEL;c.save();c.translate(p.x,p.y);c.rotate(o.heading);c.scale(sc,sc);c.fillStyle=wreck?"rgba(90,75,55,.45)":"#aeb8aa";c.strokeStyle=wreck?"#cfc3a2":"#0b100d";c.lineWidth=METERS_PER_PIXEL*1.2;c.beginPath();c.moveTo(o.length/2,0);c.lineTo(o.length/2-18,-o.beam/2);c.lineTo(-o.length/2,-o.beam/2);c.lineTo(-o.length/2,o.beam/2);c.lineTo(o.length/2-18,o.beam/2);c.closePath();c.fill();c.stroke();if(wreck){c.beginPath();c.moveTo(-o.length/2,-o.beam/2);c.lineTo(o.length/2,o.beam/2);c.moveTo(-o.length/2,o.beam/2);c.lineTo(o.length/2,-o.beam/2);c.stroke()}else{c.fillStyle="#d9e3d3";c.fillRect(-20,-4,28,8)}c.restore()}
function drawSubs(){subs.forEach(s=>{const p=worldToScreen(s);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(s.heading);ctx.globalAlpha=.18;ctx.strokeStyle="#6fe25d";ctx.beginPath();ctx.ellipse(0,0,18,4,0,0,Math.PI*2);ctx.stroke();ctx.restore()})}
function drawAircraft(){aircraft.forEach(p=>{const s=worldToScreen(p);ctx.save();ctx.translate(s.x,s.y);ctx.rotate(p.heading);ctx.scale(.7,.7);ctx.strokeStyle=p.damaged?"rgba(255,210,150,.82)":"rgba(230,230,230,.75)";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-16,0);ctx.moveTo(-3,0);ctx.lineTo(-12,-12);ctx.moveTo(-3,0);ctx.lineTo(-12,12);ctx.moveTo(8,0);ctx.lineTo(18,-18);ctx.moveTo(8,0);ctx.lineTo(18,18);ctx.stroke();ctx.restore()})}
function drawAA(){for(const tr of aaTracers){const a=1-tr.t/tr.maxT,p1=worldToScreen({x:tr.x1,y:tr.y1}),p2=worldToScreen({x:tr.x2,y:tr.y2});ctx.save();ctx.strokeStyle=`rgba(255,74,53,${.85*a})`;ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();ctx.restore()}for(const b of aaBursts){const a=1-b.t/b.maxT,p=worldToScreen(b);ctx.save();ctx.strokeStyle=`rgba(255,74,53,${.8*a})`;ctx.beginPath();ctx.arc(p.x,p.y,4+b.t*20,0,Math.PI*2);ctx.stroke();ctx.restore()}}
function drawSmoke(){ctx.save();for(const s of smoke){const p=worldToScreen(s),life=clamp(1-s.t/18,0,1);ctx.globalAlpha=.09*life;ctx.fillStyle="#c7c7bd";ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1.2,s.r/METERS_PER_PIXEL),0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawEffects(){for(const f of muzzleFlashes){const p=worldToScreen(f),a=1-f.t/.18;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(f.angle);ctx.fillStyle=`rgba(255,74,53,${a})`;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(20*a,-6*a);ctx.lineTo(29*a,0);ctx.lineTo(20*a,6*a);ctx.fill();ctx.restore()}for(const s of shells){const p=worldToScreen(s);ctx.save();ctx.fillStyle="#ff4a35";ctx.beginPath();ctx.arc(p.x,p.y-s.z/METERS_PER_PIXEL*.75,3,0,Math.PI*2);ctx.fill();ctx.restore()}for(const sp of splashes){const p=worldToScreen(sp),t=sp.t/sp.maxT;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle=sp.hit?"#f3e8bd":"#d8e8d5";ctx.beginPath();ctx.arc(p.x,p.y,6+t*26,0,Math.PI*2);ctx.stroke();ctx.restore()}}
function drawFletcher(c,x,y,h,scale=1){c.save();c.translate(x,y);c.rotate(h);c.scale(scale,scale);c.lineWidth=1.4/Math.max(scale,.1);c.strokeStyle="#0b100d";c.fillStyle="#858f84";c.beginPath();c.moveTo(58,0);c.lineTo(42,-8);c.lineTo(-45,-9);c.lineTo(-69,0);c.lineTo(-45,9);c.lineTo(42,8);c.closePath();c.fill();c.stroke();c.fillStyle="#aab3a7";c.fillRect(-42,-4.8,82,9.6);c.fillStyle="#c0c7bd";c.fillRect(11,-6.5,19,13);c.fillStyle="#747f76";c.fillRect(-28,-4.5,9,9);c.fillRect(-38,-4.2,7,8.4);turrets.forEach(t=>drawTurret(c,t.x,t.y,guns.bearing-h,scale));c.restore()}
function drawTurret(c,x,y,a,scale){c.save();c.translate(x,y);c.rotate(a);c.fillStyle="#d7ddd1";c.strokeStyle="#0b100d";c.lineWidth=1/Math.max(scale,.1);c.beginPath();c.arc(0,0,3.2,0,Math.PI*2);c.fill();c.stroke();c.beginPath();c.moveTo(0,0);c.lineTo(12,0);c.stroke();c.restore()}
function drawBoxes(){box(14,12,[`POZYCJA`,`X ${Math.round(ship.x)} m`,`Y ${Math.round(ship.y)} m`,`SEKTOR ${Math.floor(ship.x/10000)}-${Math.floor(ship.y/10000)}`]);box(14,124,lastRadarContact&&lastRadarContact.age<12?[`RADAR CEL`,`NAMIAR ${lastRadarContact.bearing.toFixed(0).padStart(3,"0")}°`,`ODL. ${lastRadarContact.range} m`,`OD ECHA ${lastRadarContact.age.toFixed(1)} s`]:[`RADAR CEL`,`BRAK`,`---`,`---`]);box(14,236,lastRadarAirContact&&lastRadarAirContact.age<12?[`RADAR LOT`,`NAMIAR ${lastRadarAirContact.bearing.toFixed(0).padStart(3,"0")}°`,`ODL. ${lastRadarAirContact.range} m`,`OD ECHA ${lastRadarAirContact.age.toFixed(1)} s`]:[`RADAR LOT`,`BRAK`,`---`,`---`]);box(game.width-204,12,[`POGODA`,`WIATR ${radToCourse(weather.windDir).toFixed(0)}°`,`${weather.windSpeed.toFixed(1)} m/s`,`FALA ${weather.wave.toFixed(2)}`,`WIDZ. ${Math.round(weather.visibility)} m`],190)}
function box(x,y,lines,w=190){ctx.save();ctx.font="bold 17px Courier New";const h=26+lines.length*22;ctx.fillStyle="rgba(5,8,6,.72)";ctx.strokeStyle="rgba(217,227,211,.42)";roundRect(ctx,x,y,w,h,8);ctx.fill();ctx.stroke();lines.forEach((l,i)=>{ctx.fillStyle=i?"#c0cab8":"#d9e3d3";ctx.fillText(l,x+10,y+22+i*22)});ctx.restore()}
function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function drawHud(){const o=speedOrders[ship.targetSpeedIndex],course=radToCourse(ship.heading).toFixed(0).padStart(3,"0"),rs=ship.rudder<-.5?"L":ship.rudder>.5?"P":"ZERO",txt=`PRĘDKOŚĆ ${o.name} / ${(ship.speed*MS_TO_KNOT).toFixed(1)} w.   STER ${Math.abs(ship.rudder).toFixed(0)}° ${rs}   KURS ${course}°`;ctx.save();ctx.font="bold 18px Courier New";const w=ctx.measureText(txt).width+32,x=(game.width-w)/2,y=game.height-52;ctx.fillStyle="rgba(5,8,6,.76)";ctx.strokeStyle="rgba(217,227,211,.48)";roundRect(ctx,x,y,w,38,8);ctx.fill();ctx.stroke();ctx.fillStyle="#d9e3d3";ctx.fillText(txt,x+16,y+25);ctx.restore()}
function drawScopes(){drawScope(sonarCtx,"sonar");drawScope(radarCtx,"radar")}
function drawScope(c,type){const w=c.canvas.width,h=c.canvas.height,size=Math.min(w,h),cx=w/2,cy=h/2,r=size*.42,range=type==="sonar"?sonar.range:radar.range,col=type==="sonar"?"#6fe25d":"#4ab6ff";c.clearRect(0,0,w,h);c.save();c.fillStyle="#030706";c.fillRect(0,0,w,h);c.strokeStyle=col;c.lineWidth=1;for(let rr=r/4;rr<=r;rr+=r/4){c.globalAlpha=.45;c.beginPath();c.arc(cx,cy,rr,0,Math.PI*2);c.stroke()}c.globalAlpha=1;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke();if(type==="radar"&&radar.on){c.save();c.translate(cx,cy);c.rotate(radar.sweepAngle);c.beginPath();c.moveTo(0,0);c.lineTo(r,0);c.stroke();c.restore();if(target.alive)dot(c,cx,cy,target,range,r,col);aircraft.forEach(p=>cross(c,cx,cy,p,range,r,col))}if(type==="sonar"&&sonar.on)subs.forEach(s=>dot(c,cx,cy,s,range,r,col));c.fillStyle=col;c.font="12px Courier New";c.fillText(`${range} m`,8,h-10);c.restore()}
function dot(c,cx,cy,o,range,r,col){const dx=o.x-ship.x,dy=o.y-ship.y,d=Math.hypot(dx,dy);if(d<=range){c.fillStyle=col;c.beginPath();c.arc(cx+dx/range*r,cy+dy/range*r,4,0,Math.PI*2);c.fill()}}
function cross(c,cx,cy,o,range,r,col){const dx=o.x-ship.x,dy=o.y-ship.y,d=Math.hypot(dx,dy);if(d<=range){const x=cx+dx/range*r,y=cy+dy/range*r;c.strokeStyle=col;c.beginPath();c.moveTo(x-4,y);c.lineTo(x+4,y);c.moveTo(x,y-4);c.lineTo(x,y+4);c.stroke()}}
function drawShipPanel(){const w=shipView.width,h=shipView.height;shipCtx.clearRect(0,0,w,h);shipCtx.fillStyle="#030706";shipCtx.fillRect(0,0,w,h);drawFletcher(shipCtx,w/2,h/2-2,ship.heading,Math.min(w,h)/210);shipCtx.fillStyle="#95a18f";shipCtx.font="12px Courier New";shipCtx.fillText(`WIATR ${radToCourse(weather.windDir).toFixed(0)}° / ${weather.windSpeed.toFixed(1)} m/s`,8,h-10)}
function updateUI(){const o=speedOrders[ship.targetSpeedIndex],course=radToCourse(ship.heading),rs=ship.rudder<-.5?"L":ship.rudder>.5?"P":"";sonarStatus.textContent=sonar.on?"WŁ.":"WYŁ.";sonarStatus.className=sonar.on?"statusOn":"statusOff";radarStatus.textContent=radar.on?"WŁ.":"WYŁ.";speedRead.textContent=o.name;rudderRead.textContent=`${Math.abs(ship.rudder).toFixed(0)}° ${rs}`;courseRead.textContent=`${course.toFixed(0).padStart(3,"0")}°`;windShort.textContent=`${radToCourse(weather.windDir).toFixed(0)}° ${weather.windSpeed.toFixed(0)}m/s`;weaponRead.innerHTML=`TRYB: <span style="color:var(--guns)">${guns.mode}</span><br>KĄT: <span style="color:var(--guns)">${radToCourse(guns.bearing).toFixed(0).padStart(3,"0")}°</span><br>ZASIĘG: <span style="color:var(--guns)">${Math.round(guns.range)} m</span><br>CEL HP: <span style="color:var(--guns)">${target.alive?Math.round(target.hp):"---"}</span><br>5”/38: 2–3 trafienia`;consolePanel.textContent=`Fletcher: max 37 w. | Condor: ${Math.round(aircraft[0].speed*MS_TO_KNOT)} w. | Radar: kreska obrotowa | Morze: Atlantyk\nSterowanie: W/S/+/- prędkość, A/D ster, G wpis kurs/kąt, F auto/manual, R reset dział, < > obrót, O/L zasięg, [ ] sonar, Spacja strzał\n${lastMessage}`}
function loop(now){const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;weather.t+=dt;updateOrders(dt);updatePhysics(dt);updateWakeSmoke(dt);updateTargets(dt);updateSonar(dt);updateRadar(dt);updateProjectiles(dt);draw();updateUI();requestAnimationFrame(loop)}
