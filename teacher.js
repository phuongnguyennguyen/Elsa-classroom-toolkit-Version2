import {$,el,message,errorText,createClient,roomPath,codeFromURL,checkCode,studentLink,setRoomURL,copyText,fillScores,fillQueue,RoomWatch,toggleSound,beep,paintClock,bootFailure} from './common.js';
import {NS,randomCode,uniqueId,parseNames,makeState,orderedQueue,timerRemaining,adjustScore,awardWinner} from './core.js';
let c,watch,roleOff,presenceOff,allowed=false,busy=false,seenWinner='',lastWheel='',wheelRotation=0,lastTimer='',finishing=false;
function lock(){document.querySelectorAll('[data-control]').forEach(b=>b.disabled=!allowed||!c?.online||busy||!watch?.state||watch.ended);if($('award'))$('award').disabled=$('award').disabled||!watch?.round?.winner||watch?.state?.currentRound?.awarded;if($('closeRound'))$('closeRound').disabled=$('closeRound').disabled||watch?.state?.currentRound?.phase!=='open';}
async function action(fn){if(busy)return;if(!allowed){message('Tài khoản chưa có quyền giảng viên.','error');return;}if(!c.online){message('Đang mất kết nối. Đợi kết nối lại rồi thao tác.','error');return;}busy=true;lock();try{await fn();}catch(e){message(errorText(e),'error');}finally{busy=false;lock();}}
async function changeState(fn){if(!watch||watch.ended)throw Error('Phòng đã đóng hoặc hết hạn. Hãy tạo phòng mới.');const target=watch.code;return c.runTransaction(c.ref(c.db,roomPath(target)+'/state'),s=>{if(!s||s.closed)return;return fn(s);},{applyLocally:false});}
function soundNewRound(w){const win=w.round?.winner;if(!w.roundReady)return;const key=win?w.roundId+':'+win.uid:'';if(key&&key!==seenWinner){if(seenWinner!==null)beep();seenWinner=key;}}
function renderWheel(state,initial=false){
 const teams=Object.entries(state.teams||{}),colors=['#d94e94','#8752c1','#df97c3','#ab82d8','#729abf','#b17ab3'];
 $('wheel').style.background='conic-gradient('+teams.map((_,i)=>`${colors[i%colors.length]} ${i/teams.length*100}% ${(i+1)/teams.length*100}%`).join(',')+')';
 $('wheel').replaceChildren();teams.forEach(([id,g],i)=>{const label=el('span',String(i+1),'wheel-label');label.style.transform=`translate(-50%,-50%) rotate(${(i+.5)*360/teams.length}deg) translateY(-48px)`;$('wheel').append(label);});
 $('wheelLegend').textContent=teams.map(([,g],i)=>(i+1)+'. '+g.name).join(' · ');
 const win=state.wheel;$('wheelResult').textContent=win?(state.teams[win.teamId]?.name||'Nhóm đã thay đổi'):'Chưa quay';
 if(win&&win.id!==lastWheel){const i=teams.findIndex(([id])=>id===win.teamId);const target=360-(i+.5)*360/teams.length;wheelRotation+=1800+((target-wheelRotation%360+360)%360);if(initial)$('wheel').style.transition='none';$('wheel').style.transform=`rotate(${wheelRotation}deg)`;if(initial)requestAnimationFrame(()=>{$('wheel').style.transition='';});lastWheel=win.id;}
}
function render(w){
 if(!w.meta||!w.state)return;const s=w.state,entries=orderedQueue(w.round),winner=w.round?.winner;
 $('roomCode').textContent=w.code;$('roomTitleLabel').textContent=w.meta.title;$('roomState').textContent=w.ended?'Phòng đã đóng / hết hạn':'Đang hoạt động';
 $('roundLabel').textContent='Lượt '+s.currentRound.number+' · '+(s.currentRound.phase==='open'?'Đang nhận tín hiệu':'Đã đóng');
 $('winnerHint').textContent=winner?'Tín hiệu được chấp nhận đầu tiên':w.ended?'Buổi học đã kết thúc':s.currentRound.phase==='open'?'Cả lớp có thể bấm chuông':'Sẵn sàng cho câu hỏi tiếp theo';
 $('winnerName').textContent=winner?.name||(w.ended?'Phòng đã đóng':s.currentRound.phase==='open'?'Đang chờ tín hiệu…':'Chờ mở lượt');
 $('winnerTeam').textContent=winner?(s.teams[winner.teamId]?.name||''):'Mở lượt để sinh viên giành quyền';
 $('queueCount').textContent=entries.length;fillQueue($('queue'),w.round,s.teams,entries);fillScores($('scores'),s.teams,(id,d)=>action(()=>changeState(v=>adjustScore(v,id,d))));
 $('award').textContent=s.currentRound.awarded?'Đã cộng điểm ✓':'Đúng · +1 điểm';
 $('timerStart').textContent=s.timer.status==='paused'?'Tiếp tục':'Bắt đầu';
 $('timerState').textContent={idle:'Chưa chạy',running:'Đang chạy',paused:'Tạm dừng',finished:'Hết giờ'}[s.timer.status];
 renderWheel(s,lastWheel===null);soundNewRound(w);paintClock(s.timer,c.now());lock();
}
function clearRoom(){watch?.stop();watch=null;presenceOff?.();presenceOff=null;seenWinner=null;lastWheel=null;$('dashboard').hidden=true;}
async function openRoom(code){
 checkCode(code);if(!c.online)throw Error('Đợi kết nối rồi mở phòng.');const meta=(await c.get(c.ref(c.db,roomPath(code)+'/meta'))).val();
 if(!meta)throw Error('Mã phòng không tồn tại. Kiểm tra lại mã.');if(meta.ownerUid!==c.auth.currentUser.uid)throw Error('Phòng này thuộc tài khoản giảng viên khác.');
 clearRoom();message('');setRoomURL(code);$('setup').hidden=true;$('dashboard').hidden=false;
 watch=new RoomWatch(c,code,render).start();
 presenceOff=c.onValue(c.ref(c.db,roomPath(code)+'/presence'),s=>{const n=Object.keys(s.val()||{}).length;$('onlineCount').textContent=n+' sinh viên online';if(n>=85)$('connectionNote').textContent='Đang gần giới hạn 100 kết nối của gói Spark. Nên dùng một điện thoại đại diện mỗi nhóm.';},e=>message(errorText(e),'error'));
}
async function checkRole(user){
 roleOff?.();allowed=false;clearRoom();$('loading').hidden=true;$('setup').hidden=true;$('permissionGate').hidden=true;$('loginGate').hidden=Boolean(user);$('logout').hidden=!user;
 if(!user)return;
 $('teacherUID').value=user.uid;
 roleOff=c.onValue(c.ref(c.db,NS+'/teachers/'+user.uid),async snap=>{
  allowed=snap.val()===true;$('permissionGate').hidden=allowed;$('loginGate').hidden=true;
  if(!allowed){clearRoom();$('setup').hidden=true;lock();return;}
  $('setup').hidden=false;const code=codeFromURL();if(code&&!watch)try{await openRoom(code);}catch(e){message(errorText(e),'error');}lock();
 },e=>{allowed=false;clearRoom();$('permissionGate').hidden=false;message(errorText(e),'error');});
}
function selectedDuration(){const min=Number($('minutes').value),sec=Number($('seconds').value);if(!Number.isInteger(min)||!Number.isInteger(sec)||min<0||sec<0||sec>59||min*60+sec<1||min*60+sec>10800)throw Error('Chọn thời gian từ 1 giây đến 180 phút.');return (min*60+sec)*1000;}
function drawQR(){if(!watch)return;const link=studentLink(watch.code,$('qrGroup').value);$('qrRoom').textContent=watch.code;$('qrLink').textContent=link;if(!window.QRCode?.toCanvas){message('Không tải được qr.js. Kiểm tra đã upload đủ file.','error');return;}window.QRCode.toCanvas($('qrCanvas'),link,{width:360,margin:4,errorCorrectionLevel:'M',color:{dark:'#342443',light:'#ffffff'}},e=>{if(e)message('Không tạo được QR. Có thể sao chép link sinh viên bên dưới.','error');});}
async function start(){
 c=await createClient('teacher');c.onConnection=()=>lock();c.onAuthStateChanged(c.auth,user=>{checkRole(user).catch(bootFailure);});
 $('sound').onclick=toggleSound;
 $('makeGroups').onclick=()=>{const n=Number($('createCount').value);if(!Number.isInteger(n)||n<1||n>20){message('Số nhóm từ 1 đến 20.','error');return;}const old=$('teamNames').value.split('\n').map(x=>x.trim()).filter(Boolean);$('teamNames').value=Array.from({length:n},(_,i)=>old[i]||'Nhóm '+(i+1)).join('\n');};
 $('loginForm').onsubmit=async e=>{e.preventDefault();$('loginButton').disabled=true;message('');try{await c.signInWithEmailAndPassword(c.auth,$('email').value.trim(),$('password').value);$('password').value='';}catch(err){message(errorText(err),'error');}finally{$('loginButton').disabled=false;}};
 $('logout').onclick=async()=>{roleOff?.();await c.signOut(c.auth);};$('refreshRole').onclick=()=>checkRole(c.auth.currentUser);
 $('createForm').onsubmit=e=>{e.preventDefault();action(async()=>{
  const names=parseNames($('teamNames').value),title=$('roomTitle').value.trim();if(!title)throw Error('Nhập tên buổi học.');let code;
  for(let i=0;i<5;i++){code=randomCode();const room={meta:{ownerUid:c.auth.currentUser.uid,title,version:3,createdAt:c.serverTimestamp(),expiresAt:Math.round(c.now()+14400000)},state:makeState(names)};const r=await c.runTransaction(c.ref(c.db,roomPath(code)),old=>old?undefined:room,{applyLocally:false});if(r.committed){await openRoom(code);return;}}
  throw Error('Chưa tạo được mã phòng. Vui lòng thử lại.');
 });};
 $('resumeForm').onsubmit=e=>{e.preventDefault();action(()=>openRoom($('resumeCode').value.trim().toUpperCase()));};
 $('backSetup').onclick=()=>{clearRoom();const u=new URL(location.href);u.searchParams.delete('room');history.replaceState(null,'',u);$('setup').hidden=false;message('');};
 $('openRound').onclick=()=>action(()=>{const id=uniqueId();return changeState(s=>{const current=s.currentRound;if(current.phase==='open')throw Error('Lượt đang mở. Đóng hoặc bắt đầu lượt mới trước.');s.currentRound={id,number:current.number+1,phase:'open',awarded:false};return s;});});
 $('closeRound').onclick=()=>action(()=>changeState(s=>{s.currentRound.phase='closed';return s;}));
 $('resetRound').onclick=()=>action(async()=>{if(watch.state.currentRound.phase==='open'&&!confirm('Kết thúc lượt đang mở và chuẩn bị lượt mới?'))return;const id=uniqueId();await changeState(s=>{s.currentRound={id,number:s.currentRound.number,phase:'closed',awarded:false};return s;});});
 $('award').onclick=()=>action(async()=>{const win=watch.round?.winner,id=watch.roundId;if(!win)return;const r=await changeState(s=>awardWinner(s,id,win.teamId));if(!r.committed)message('Lượt này đã được cộng điểm hoặc đã chuyển sang lượt khác.');});
 $('closeRoom').onclick=()=>action(async()=>{if(!confirm('Đóng phòng? Sinh viên sẽ không gửi thêm lượt bấm. Điểm vẫn được giữ để xuất file.'))return;await changeState(s=>{s.closed=true;s.currentRound.phase='closed';if(s.timer.status==='running'){s.timer.remainingMs=timerRemaining(s.timer,c.now());s.timer.status='paused';s.timer.startedAt=0;}return s;});});
 $('timerStart').onclick=()=>action(()=>{const chosen=selectedDuration();return changeState(s=>{if(s.timer.status==='running')return;const left=s.timer.status==='paused'&&s.timer.remainingMs>0?s.timer.remainingMs:chosen;s.timer={durationMs:s.timer.status==='paused'?s.timer.durationMs:chosen,remainingMs:left,startedAt:c.serverTimestamp(),status:'running',revision:uniqueId()};return s;});});
 $('timerPause').onclick=()=>action(()=>changeState(s=>{if(s.timer.status!=='running')return;s.timer.remainingMs=timerRemaining(s.timer,c.now());s.timer.startedAt=0;s.timer.status='paused';return s;}));
 $('timerReset').onclick=()=>action(()=>{const duration=selectedDuration();return changeState(s=>{s.timer={durationMs:duration,remainingMs:duration,startedAt:0,status:'idle',revision:uniqueId()};return s;});});
 $('spin').onclick=()=>action(()=>{const ids=Object.keys(watch.state.teams);const a=new Uint32Array(1),max=Math.floor(4294967296/ids.length)*ids.length;do{crypto.getRandomValues(a);}while(a[0]>=max);const chosen=ids[a[0]%ids.length];return changeState(s=>{if(!s.teams[chosen])return;s.wheel={teamId:chosen,at:c.serverTimestamp(),id:uniqueId()};return s;});});
 $('editNames').onclick=()=>{if(!watch||watch.ended)return;$('editTeamNames').value=Object.values(watch.state.teams).map(g=>g.name).join('\n');$('namesDialog').showModal();};
 $('cancelNames').onclick=()=>$('namesDialog').close();$('saveTeamNames').onclick=()=>action(async()=>{const names=parseNames($('editTeamNames').value);await changeState(s=>{const ids=Object.keys(s.teams);if(names.length!==ids.length)throw Error('Giữ nguyên số nhóm. Muốn đổi số nhóm, hãy tạo phòng mới.');ids.forEach((id,i)=>s.teams[id].name=names[i]);return s;});$('namesDialog').close();});
 $('showQR').onclick=()=>{if(!watch)return;$('qrGroup').replaceChildren(new Option('Cả lớp — tự chọn nhóm',''));for(const[id,g]of Object.entries(watch.state.teams))$('qrGroup').append(new Option(g.name,id));drawQR();$('qrDialog').showModal();};$('qrGroup').onchange=drawQR;$('closeQR').onclick=()=>$('qrDialog').close();$('copyLink').onclick=()=>copyText($('qrLink').textContent);$('printQR').onclick=()=>window.print();
 $('exportScores').onclick=()=>{if(!watch?.state)return;const safe=v=>'"'+String(v).replace(/^[=+@\-]/,"'$&").replaceAll('"','""')+'"';const rows=[['Phòng','Nhóm','Điểm'],...Object.values(watch.state.teams).map(g=>[watch.code,g.name,g.score])];const blob=new Blob(['\ufeff'+rows.map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download='Diem_'+watch.code+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
 setInterval(()=>{if(!watch?.state)return;const timer=watch.state.timer,left=paintClock(timer,c.now());if(watch.ended)lock();if(timer.status==='running'&&left<=0){$('timerState').textContent='Hết giờ';if(lastTimer!==timer.revision){lastTimer=timer.revision;beep();}if(c.online&&allowed&&!watch.ended&&!busy&&!finishing){finishing=true;const revision=timer.revision;changeState(s=>{if(s.timer.revision!==revision||s.timer.status!=='running')return;s.timer.remainingMs=0;s.timer.startedAt=0;s.timer.status='finished';return s;}).catch(()=>{}).finally(()=>finishing=false);}}},250);
}
start().catch(bootFailure);
