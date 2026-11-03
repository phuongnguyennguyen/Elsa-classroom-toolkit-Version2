import {$,message,errorText,createClient,roomPath,codeFromURL,checkCode,setRoomURL,fillScores,RoomWatch,toggleSound,beep,paintClock,bootFailure} from './common.js';
import {canBuzz,orderedQueue,submitBuzz} from './core.js';
let c,watch,member=null,submitting=false,memberReady=false,presenceRef=null,presenceJob=null,seenWinner=null,seenTimer='',joinVersion=0;
function render(w){
 if(w.loaded&&!w.meta){message('Mã phòng không tồn tại hoặc đã được xóa. Kiểm tra lại mã.','error');$('joinForm').hidden=true;return;}
 if(!w.meta||!w.state)return;const s=w.state;
 if(!member){$('joinRoomTitle').textContent=w.meta.title;$('joinForm').hidden=w.ended;const selected=$('team').value||new URL(location.href).searchParams.get('group');$('team').replaceChildren(new Option('— Chọn nhóm —',''));for(const[id,g]of Object.entries(s.teams))$('team').append(new Option(g.name,id));if(selected&&s.teams[selected])$('team').value=selected;if(w.ended)message('Phòng đã đóng hoặc hết hạn. Xin mã phòng mới từ giảng viên.','error');return;}
 $('joinGate').hidden=true;$('studentView').hidden=false;$('myName').textContent=member.name;$('myGroup').textContent=s.teams[member.teamId]?.name||'Nhóm không còn trong phòng';$('myRoom').textContent='Phòng '+w.code;
 $('roundLabel').textContent='Lượt '+s.currentRound.number;fillScores($('scores'),s.teams);paintClock(s.timer,c.now());
 $('wheelResult').textContent='Vòng quay: '+(s.wheel?s.teams[s.wheel.teamId]?.name||'—':'chưa quay');
 const mine=w.round?.requests?.[c.auth.currentUser.uid],winner=w.round?.winner;
 $('buzz').disabled=submitting||!w.roundReady||!canBuzz(s,w.meta,w.round,c.auth.currentUser.uid,c.online,c.now());
 if(submitting){$('buzz').textContent='ĐANG GỬI…';$('buzzStatus').textContent='Đợi Firebase xác nhận. Không cần bấm lại.';return;}
 if(w.ended){$('roundTitle').textContent='Buổi học đã kết thúc';$('roundHelp').textContent='Cảm ơn bạn đã tham gia!';$('buzz').textContent='PHÒNG ĐÃ ĐÓNG';$('buzzStatus').textContent='Xin mã phòng mới từ giảng viên để tiếp tục.';}
 else if(!c.online){$('roundTitle').textContent='Đang kết nối lại…';$('roundHelp').textContent='Kết quả sẽ tự cập nhật khi có mạng.';$('buzz').textContent='CHỜ KẾT NỐI';$('buzzStatus').textContent='Không gửi lượt bấm khi mất mạng.';}
 else if(mine){const rank=orderedQueue(w.round).findIndex(x=>x.uid===c.auth.currentUser.uid)+1;$('roundTitle').textContent=winner?.uid===c.auth.currentUser.uid?'Bạn đã giành quyền!':'Đã ghi nhận lượt bấm';$('roundHelp').textContent='Mỗi người bấm một lần trong mỗi lượt.';$('buzz').textContent='ĐÃ GHI NHẬN ✓';$('buzzStatus').textContent=winner?.uid===c.auth.currentUser.uid?'Sẵn sàng trả lời câu hỏi của giảng viên.':'Bạn đang ở vị trí '+rank+' trong hàng đợi.';}
 else if(s.currentRound.phase!=='open'){$('roundTitle').textContent='Chờ giảng viên mở lượt';$('roundHelp').textContent='Nút bấm sẽ tự sáng khi lượt được mở.';$('buzz').textContent='CHỜ MỞ LƯỢT';$('buzzStatus').textContent='Lượt trả lời chưa được mở.';}
 else{$('roundTitle').textContent=winner?'Bạn vẫn có thể vào hàng đợi':'Lượt đã mở!';$('roundHelp').textContent=winner?'Giảng viên có thể gọi người tiếp theo nếu cần.':'Bấm ngay để giành quyền trả lời.';$('buzz').textContent=winner?'VÀO HÀNG ĐỢI':'BẤM NGAY';$('buzzStatus').textContent=w.roundReady?'Sẵn sàng nhận tín hiệu.':'Đang đồng bộ lượt…';}
 $('studentWinner').hidden=!winner;if(winner){$('winnerName').textContent=winner.name;$('winnerTeam').textContent=s.teams[winner.teamId]?.name||'';const key=w.roundId+':'+winner.uid;if(seenWinner!==null&&seenWinner!==key)beep();seenWinner=key;}else if(w.roundReady)seenWinner='';
}
async function markPresence(){
 if(!c.online||!watch||!member||watch.ended||presenceJob)return;
 const code=watch.code,uid=c.auth.currentUser.uid,version=joinVersion;
 presenceJob=(async()=>{const r=c.push(c.ref(c.db,roomPath(code)+'/presence/'+uid));await c.onDisconnect(r).remove();if(!c.online||version!==joinVersion)return;await c.set(r,true);if(version!==joinVersion){await c.remove(r);return;}presenceRef=r;})().catch(()=>{}).finally(()=>presenceJob=null);
 await presenceJob;
}
async function leave(){joinVersion++;watch?.stop();watch=null;member=null;memberReady=false;seenWinner=null;if(presenceRef){const old=presenceRef;presenceRef=null;c.remove(old).catch(()=>{});c.onDisconnect(old).cancel().catch(()=>{});} $('studentView').hidden=true;$('joinGate').hidden=false;$('joinForm').hidden=true;}
async function findRoom(code){
 checkCode(code);if(!c.online)throw Error('Đang kết nối. Chờ một chút rồi bấm Tìm phòng.');await leave();message('');setRoomURL(code);$('joinCode').value=code;
 const version=joinVersion,meta=(await c.get(c.ref(c.db,roomPath(code)+'/meta'))).val();if(!meta)throw Error('Mã phòng không tồn tại hoặc đã được xóa.');
 const stored=(await c.get(c.ref(c.db,roomPath(code)+'/members/'+c.auth.currentUser.uid))).val();if(version!==joinVersion)return;member=stored;memberReady=true;
 watch=new RoomWatch(c,code,w=>{render(w);if(member&&!presenceRef&&c.online)markPresence();}).start();
}
async function start(){
 c=await createClient('student');await c.signInAnonymously(c.auth);$('loading').hidden=true;$('joinGate').hidden=false;
 c.onConnection=online=>{if(!online)presenceRef=null;else markPresence();if(watch)render(watch);};
 $('sound').onclick=toggleSound;
 $('roomForm').onsubmit=async e=>{e.preventDefault();$('findRoom').disabled=true;try{await findRoom($('joinCode').value.trim().toUpperCase());}catch(err){message(errorText(err),'error');}finally{$('findRoom').disabled=false;}};
 $('joinForm').onsubmit=async e=>{e.preventDefault();if(!watch||!memberReady||watch.ended||!c.online){message('Phòng chưa sẵn sàng hoặc đã đóng.','error');return;}$('joinButton').disabled=true;try{const name=$('studentName').value.trim(),teamId=$('team').value;if(!name||name.length>50||!watch.state.teams[teamId])throw Error('Nhập họ tên và chọn đúng nhóm.');const code=watch.code,version=joinVersion;const m={name,teamId,joinedAt:c.serverTimestamp()};await c.set(c.ref(c.db,roomPath(code)+'/members/'+c.auth.currentUser.uid),m);if(version!==joinVersion)return;member={name,teamId};message('');render(watch);await markPresence();}catch(err){message(errorText(err),'error');}finally{$('joinButton').disabled=false;}};
 $('buzz').onclick=async()=>{
  if(submitting||!watch?.roundReady||!member||!canBuzz(watch.state,watch.meta,watch.round,c.auth.currentUser.uid,c.online,c.now()))return;
  const code=watch.code,id=watch.roundId;submitting=true;render(watch);message('');
  try{await submitBuzz(c,roomPath(code)+'/rounds/'+id,c.auth.currentUser.uid,member);}
  catch(err){message(errorText(err),'error');}
  finally{submitting=false;if(watch)render(watch);}
 };
 $('leaveRoom').onclick=async()=>{await leave();const u=new URL(location.href);u.search='';history.replaceState(null,'',u);$('joinCode').value='';message('');};
 setInterval(()=>{if(!watch?.state||!member)return;const t=watch.state.timer,ms=paintClock(t,c.now());$('timerCaption').textContent=(t.status==='finished'||t.status==='running'&&ms<=0)?'Hết giờ':'Thời gian thảo luận';if((t.status==='finished'||t.status==='running'&&ms<=0)&&seenTimer!==t.revision){seenTimer=t.revision;beep();}if(watch.ended||!c.online)render(watch);},300);
 const code=codeFromURL();if(code){$('joinCode').value=code;
  // Wait only for the first connection; normal reconnect is handled by the SDK.
  if(c.online)await findRoom(code);else{const original=c.onConnection;c.onConnection=online=>{original(online);if(online){c.onConnection=original;findRoom(code).catch(e=>message(errorText(e),'error'));}};}
 }
}
start().catch(bootFailure);
