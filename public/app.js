const app = document.getElementById('app');
const toast = document.getElementById('toast');
const pathName = location.pathname.toLowerCase();
const routeMode = pathName.startsWith('/host') ? 'host' : pathName.startsWith('/play') ? 'player' : 'portal';

const state = {
  view: 'home', code: '', hostKey: '', playerId: '', data: null, poll: null,
  selectedChoice: null, selectedFinal: null, openPanel: null,
  playStarted: sessionStorage.getItem('barfly_play_started') === '1',
  drafts: { public: '', private: '', alliance: '', allianceName: '' },
  privateRecipient: '', allianceRecipient: ''
};

let episodeOptions = [];
const phaseLabels = {
  lobby:'Lobby', role_reveal:'Role Reveal', public_event:'Public Event', private_scenario:'Private Scenario',
  public_discussion:'Public Discussion', private_alliance:'Private Alliance', choice_lock:'Choice Lock',
  round_results:'Round Results', final_intro:'Final Encounter', final_choice:'Final Choice', ending:'Ending'
};

function html(strings,...values){ return strings.map((s,i)=>s+(values[i]??'')).join(''); }
function esc(x){ return String(x??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function showToast(message){ toast.textContent=message; toast.hidden=false; clearTimeout(showToast.t); showToast.t=setTimeout(()=>toast.hidden=true,3500); }
async function api(path, options={}){
  const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},body:options.body?JSON.stringify(options.body):undefined});
  const data=await res.json().catch(()=>null);
  if(!res.ok || !data || data.error) throw new Error(data?.error || 'Request failed.');
  return data;
}
function ep(){ return state.data?.episode || {}; }
function savePlayer(code, playerId){ localStorage.setItem('barfly_player_code',code); localStorage.setItem('barfly_player_id',playerId); state.view='player'; state.code=code; state.playerId=playerId; }
function saveHost(code,hostKey,meta={}){
  sessionStorage.setItem(`barfly_host_key_${code}`,hostKey); sessionStorage.setItem('barfly_last_host_code',code);
  const games=JSON.parse(localStorage.getItem('barfly_host_games')||'[]').filter(g=>g.code!==code);
  games.unshift({code,title:meta.title||'Game',venue:meta.venue||'',savedAt:Date.now()});
  localStorage.setItem('barfly_host_games',JSON.stringify(games.slice(0,30)));
  state.view='host'; state.code=code; state.hostKey=hostKey;
}
function clearActive(){ stopPolling(); state.view='home'; state.code=''; state.hostKey=''; state.playerId=''; state.data=null; state.openPanel=null; renderHome(); }
window.clearActive=clearActive;
function captureDrafts(){
  const pub=document.querySelector('#publicChatForm textarea'); if(pub) state.drafts.public=pub.value;
  const pm=document.querySelector('#pmForm textarea'); if(pm) state.drafts.private=pm.value;
  const gm=document.querySelector('#groupPmForm textarea'); if(gm) state.drafts.alliance=gm.value;
  const an=document.querySelector('#allianceForm input[name="name"]'); if(an) state.drafts.allianceName=an.value;
  const pr=document.querySelector('#pmForm select[name="toPlayerId"]'); if(pr) state.privateRecipient=pr.value;
  const ar=document.querySelector('#groupPmForm select[name="allianceId"]'); if(ar) state.allianceRecipient=ar.value;
}
function startPolling(){ stopPolling(); fetchState(); state.poll=setInterval(fetchState,1000); }
function stopPolling(){ if(state.poll) clearInterval(state.poll); state.poll=null; }
async function fetchState(){
  if(!state.code) return;
  try{
    captureDrafts();
    let url=`/api/sessions/${encodeURIComponent(state.code)}/state`;
    if(state.view==='host') url+=`?hostKey=${encodeURIComponent(state.hostKey)}`;
    if(state.view==='player') url+=`?playerId=${encodeURIComponent(state.playerId)}`;
    state.data=await api(url); render();
  }catch(err){ showToast(err.message); if(/session not found|invalid host key|player session/i.test(err.message)) clearActive(); }
}
async function loadEpisodes(){ try{ const d=await api('/api/episodes'); episodeOptions=d.episodes||[]; }catch{ episodeOptions=[]; } }
function render(){ if(state.view==='host'&&state.data) return renderHost(); if(state.view==='player'&&state.data) return renderPlayer(); renderHome(); }
function renderHome(){ stopPolling(); if(routeMode==='host') return renderHostHome(); if(routeMode==='player') return renderPlayerHome(); renderPortal(); }

function renderPortal(){ app.innerHTML=`<section class="hero"><div class="title-card"><h1>Barfly Social</h1><p class="tagline">Escape Experiences</p><div class="grid two"><a class="btn primary" href="/host">Host</a><a class="btn primary" href="/play">Play</a></div></div></section>`; }
function episodeOptionsHtml(){ return episodeOptions.map(e=>`<option value="${esc(e.id)}">${esc(e.subtitle?e.subtitle+' · ':'')}${esc(e.title)}</option>`).join(''); }
function hostGames(){ try{return JSON.parse(localStorage.getItem('barfly_host_games')||'[]');}catch{return [];} }
function removeSavedHostGame(code){
  const games=hostGames().filter(g=>g.code!==code);
  localStorage.setItem('barfly_host_games',JSON.stringify(games));
  sessionStorage.removeItem(`barfly_host_key_${code}`);
  if(sessionStorage.getItem('barfly_last_host_code')===code) sessionStorage.removeItem('barfly_last_host_code');
}
async function deleteHostSession(code,hostKey){
  const typed=window.prompt(`Type DELETE to permanently delete session ${code}.`);
  if(typed!=='DELETE') return;
  try{
    await api(`/api/sessions/${encodeURIComponent(code)}/host/delete`,{method:'POST',body:{hostKey}});
    removeSavedHostGame(code);
    showToast('Session deleted.');
    if(state.code===code) clearActive(); else renderHostHome();
  }catch(err){showToast(err.message);}
}
function renderHostHome(){
  const cards=hostGames().map(g=>`<div class="player-row"><div><strong>${esc(g.title)}</strong><small>${esc(g.venue)} · ${esc(g.code)}</small></div><div class="host-controls"><button class="btn small" data-open-host="${esc(g.code)}">Open</button><button class="btn danger small" data-delete-host="${esc(g.code)}">Delete</button></div></div>`).join('');
  app.innerHTML=html`<section class="app-shell"><div class="grid two">
    <div class="panel"><h2>Create Game</h2><form class="form" id="createForm">
      <label>Episode<select name="episodeId">${episodeOptionsHtml()}</select></label>
      <label>Venue / Session Name<input name="venueName" maxlength="60" required></label>
      <div class="grid two"><label>Date<input type="date" name="scheduledDate"></label><label>Time<input type="time" name="scheduledTime"></label></div>
      <div class="grid two"><label>Players<select name="maxPlayers"><option>6</option><option>5</option><option>4</option><option>3</option><option>2</option></select></label><label>Mode<select name="mode"><option value="standard">Standard</option><option value="quick">Quick</option><option value="long">Long</option></select></label></div>
      <div class="grid two"><label>4-digit Host PIN<input name="hostPin" inputmode="numeric" pattern="\\d{4}" maxlength="4" required></label><label>Confirm PIN<input name="confirmPin" inputmode="numeric" pattern="\\d{4}" maxlength="4" required></label></div>
      <label class="check"><input type="checkbox" name="autoRunEnabled" checked> Automatically run all phases</label>
      <label class="check"><input type="checkbox" name="autoStartEnabled"> Auto-start at scheduled time when players are present</label>
      <button class="btn primary">Create Game</button>
    </form></div>
    <div class="grid"><div class="panel"><h2>Open Game</h2><form class="form" id="unlockForm"><label>Game Code<input name="code" maxlength="8" required></label><label>Host PIN<input name="hostPin" inputmode="numeric" maxlength="4" required></label><button class="btn primary">Open</button></form></div>
    <div class="panel"><h2>My Games</h2><div class="players">${cards||'<p class="muted">No saved games on this device.</p>'}</div></div></div>
  </div></section>`;
  document.getElementById('createForm').addEventListener('submit',async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget); if(fd.get('hostPin')!==fd.get('confirmPin')) return showToast('Host PINs do not match.');
    const body=Object.fromEntries(fd.entries()); body.autoRunEnabled=fd.has('autoRunEnabled'); body.autoStartEnabled=fd.has('autoStartEnabled'); delete body.confirmPin;
    try{ const d=await api('/api/sessions',{method:'POST',body}); saveHost(d.session.code,d.hostKey,{title:d.episode.title,venue:d.session.venueName}); startPolling(); }catch(err){showToast(err.message);}
  });
  document.getElementById('unlockForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await unlockHost(String(fd.get('code')).toUpperCase(),String(fd.get('hostPin')));});
  document.querySelectorAll('[data-open-host]').forEach(b=>b.addEventListener('click',async()=>{
    const code=b.dataset.openHost; const pin=window.prompt('Enter the 4-digit Host PIN'); if(pin) unlockHost(code,pin);
  }));
  document.querySelectorAll('[data-delete-host]').forEach(b=>b.addEventListener('click',async()=>{
    const code=b.dataset.deleteHost;
    const pin=window.prompt('Enter the 4-digit Host PIN to delete this session.');
    if(!pin) return;
    try{
      const d=await api(`/api/sessions/${encodeURIComponent(code)}/host/unlock`,{method:'POST',body:{hostPin:pin}});
      await deleteHostSession(code,d.hostKey);
    }catch(err){showToast(err.message);}
  }));
}
async function unlockHost(code,pin){ try{const d=await api(`/api/sessions/${encodeURIComponent(code)}/host/unlock`,{method:'POST',body:{hostPin:pin}});saveHost(code,d.hostKey,{title:d.episode.title,venue:d.session.venueName});startPolling();}catch(err){showToast(err.message);} }

function renderPlayerHome(){
  if(!state.playStarted){
    app.innerHTML=`<section class="play-splash"><img src="/barfly-escape-title.png" alt="Barfly Social Escape Experiences"><button class="btn primary tap-start" id="tapStart">Tap to Start</button></section>`;
    document.getElementById('tapStart').addEventListener('click',()=>{state.playStarted=true;sessionStorage.setItem('barfly_play_started','1');renderPlayerHome();}); return;
  }
  const code=new URLSearchParams(location.search).get('code')||'';
  app.innerHTML=html`<section class="hero"><div class="title-card compact-card"><h1>Join Game</h1><form class="form" id="joinForm"><label>Game Code<input name="code" maxlength="8" value="${esc(code.toUpperCase())}" required></label><label>Alias / Nickname<input name="alias" maxlength="24" required></label><button class="btn primary">Join Game</button></form><div class="actions"><button class="btn" id="howBtn">How to Play</button><button class="btn" id="resumePlayer">Resume</button></div></div></section>${howModal()}`;
  document.getElementById('joinForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),c=String(fd.get('code')).toUpperCase(),alias=String(fd.get('alias'));try{const d=await api(`/api/sessions/${encodeURIComponent(c)}/join`,{method:'POST',body:{alias}});savePlayer(c,d.playerId);startPolling();}catch(err){showToast(err.message);}});
  document.getElementById('howBtn').addEventListener('click',()=>openStaticModal());
  document.getElementById('resumePlayer').addEventListener('click',()=>{const c=localStorage.getItem('barfly_player_code'),pid=localStorage.getItem('barfly_player_id');if(!c||!pid)return showToast('No saved player session.');savePlayer(c,pid);startPolling();});
  bindStaticModal();
}
function howModal(){return `<div class="info-modal" id="staticModal" hidden><div class="info-modal__backdrop" data-close-static></div><div class="info-modal__card"><h2>How to Play</h2><p>Join with the host’s code. Read each public event and your private scenario. Talk openly, form private alliances, then lock one choice before the timer ends. The game moves automatically through six rounds and the final encounter.</p><button class="btn primary" data-close-static>Close</button></div></div>`;}
function openStaticModal(){document.getElementById('staticModal').hidden=false;} function bindStaticModal(){document.querySelectorAll('[data-close-static]').forEach(x=>x.addEventListener('click',()=>document.getElementById('staticModal').hidden=true));}

function countdownText(s){ if(s.paused) return 'Paused'; if(!s.phaseEndsAt) return s.autoRunEnabled?'Waiting':'Manual'; const ms=Math.max(0,new Date(s.phaseEndsAt)-Date.now()); const sec=Math.ceil(ms/1000); return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`; }
function scheduleText(s){ return s.scheduledDate&&s.scheduledTime?`${s.scheduledDate} at ${s.scheduledTime}`:'Not scheduled'; }
function renderHost(){
  const d=state.data,s=d.session,e=d.episode,r=d.round;
  app.innerHTML=html`<section class="app-shell"><div class="panel"><div class="header"><div><div class="kicker">${esc(e.subtitle||'')}</div><h2>${esc(e.title)}</h2><p class="muted">${esc(s.venueName)} · <span class="session-code">${esc(s.code)}</span> · ${esc(scheduleText(s))}</p></div><div class="timer-box"><span>${esc(phaseLabels[s.phase]||s.phase)}</span><strong>${esc(countdownText(s))}</strong></div></div>
    <div class="host-controls"><button class="btn primary" id="advanceBtn">${s.status==='lobby'?'Start Game':'Advance Now'}</button><button class="btn" id="pauseBtn">${s.paused?'Resume':'Pause'}</button><button class="btn" id="addTime">+30 sec</button><button class="btn" id="autoBtn">Auto-Run ${s.autoRunEnabled?'On':'Off'}</button><button class="btn" id="copyBtn">Copy Join Link</button><button class="btn danger" id="resetBtn">Reset</button><button class="btn danger" id="deleteSessionBtn">Delete Session</button><button class="btn" id="backBtn">Games</button></div>
    <div class="qr-row"><img src="/api/sessions/${esc(s.code)}/qr.svg" alt="Join QR"><div><strong>Player Join</strong><p class="muted">${esc(location.origin+'/play?code='+s.code)}</p></div></div>
    ${r?`<div class="divider"></div><h3>Round ${r.number}: ${esc(r.title)}</h3><p>${esc(r.publicEvent)}</p>`:''}</div>
    <div class="grid host"><div class="grid">${renderHostPlayers(d)}${renderHostMessages(d)}${renderHostResults(d)}</div><aside class="grid">${renderGroupStats(d.groupStats,true)}${renderHostChoices(d)}${renderFinalPanel(d)}</aside></div></section>`;
  const post=async(path,body={})=>{try{await api(`/api/sessions/${s.code}/host/${path}`,{method:'POST',body:{hostKey:state.hostKey,...body}});await fetchState();}catch(err){showToast(err.message);}};
  document.getElementById('advanceBtn').onclick=()=>post('advance');
  document.getElementById('pauseBtn').onclick=()=>post('automation',{action:s.paused?'resume':'pause'});
  document.getElementById('addTime').onclick=()=>post('automation',{action:'add_time',seconds:30});
  document.getElementById('autoBtn').onclick=()=>post('automation',{action:s.autoRunEnabled?'disable':'enable'});
  document.getElementById('copyBtn').onclick=async()=>{const link=`${location.origin}/play?code=${s.code}`;try{await navigator.clipboard.writeText(link);showToast('Join link copied.');}catch{showToast(link);}};
  document.getElementById('resetBtn').onclick=()=>{if(confirm('Reset this game?'))post('reset');};
  document.getElementById('deleteSessionBtn').onclick=()=>deleteHostSession(s.code,state.hostKey);
  document.getElementById('backBtn').onclick=clearActive;
  document.querySelectorAll('[data-remove-player]').forEach(b=>b.onclick=()=>post('remove',{playerId:b.dataset.removePlayer}));
}
function renderHostPlayers(d){return `<div class="panel"><div class="header"><h2>Players</h2><span>${d.players.length}/${d.session.maxPlayers}</span></div><div class="players">${d.players.map(p=>`<div class="player-row"><div><strong>${esc(p.alias)}</strong><small>${esc(roleName(p.role))} · ${esc(p.status)}</small></div><button class="btn danger small" data-remove-player="${p.id}">Remove</button></div>`).join('')||'<p class="muted">Waiting for players.</p>'}</div></div>`;}
function renderHostMessages(d){return `<div class="grid two"><div class="panel"><h2>Public Messages</h2><div class="chatbox">${renderMessages(d.publicChat||[])}</div></div><div class="panel"><h2>Private Messages</h2><div class="chatbox">${renderPrivateMessages(d.privateMessages||[])}</div></div></div>`;}
function renderHostResults(d){const x=d.latestResult;return `<div class="panel"><h2>Latest Result</h2>${x?`<div class="log">${esc(x.publicSummary)}</div><div class="divider"></div><div class="log">${esc(x.hostSummary)}</div>`:'<p class="muted">No result yet.</p>'}</div>`;}
function renderHostChoices(d){return `<div class="panel"><h2>Choices</h2>${d.players.map(p=>`<div class="player-row"><span>${esc(p.alias)}</span><small>${esc(p.choices?.[d.session.currentRound]?.choiceLabel||'Not locked')}</small></div>`).join('')}</div>`;}
function renderFinalPanel(d){return `<div class="panel"><h2>Final</h2>${d.final?`<strong>${esc(d.final.outcome)}</strong><p>${esc(d.final.endingText)}</p>`:`<p class="muted">${esc(d.episode.finalThreat)} appears after the final round.</p>`}</div>`;}

function renderPlayer(){
  const d=state.data,s=d.session,p=d.player,e=d.episode,r=d.round;
  const share=s.phase==='lobby'?`<div class="qr-row"><img src="/api/sessions/${esc(s.code)}/qr.svg" alt="Join QR"><div><strong>Share this game</strong><p class="muted">Code ${esc(s.code)}</p><button class="btn small" id="shareGame">Share</button></div></div>`:'';
  app.innerHTML=html`<section class="app-shell"><div class="panel"><div class="header"><div><div class="kicker">${esc(p.alias)} · ${esc(e.title)}</div><h2>${s.currentRound?`Round ${s.currentRound}${r?': '+esc(r.title):''}`:'Lobby'}</h2></div><div class="timer-box"><span>${esc(phaseLabels[s.phase]||s.phase)}</span><strong>${esc(countdownText(s))}</strong></div></div>
    <div class="quick-buttons"><button class="btn" data-info="status">Status</button><button class="btn" data-info="group">Group Status</button><button class="btn" data-info="players">Players</button></div>${share}</div>
    ${renderPlayerPhase(d)}${renderPlayerChat(d)}${infoModal(d)}</section>`;
  bindPlayerEvents(d); bindInfoModal();
  document.getElementById('shareGame')?.addEventListener('click',async()=>{const link=`${location.origin}/play?code=${s.code}`;try{if(navigator.share)await navigator.share({title:e.title,url:link});else await navigator.clipboard.writeText(link);showToast('Game shared.');}catch{}});
}
function renderPlayerPhase(d){const s=d.session,p=d.player,r=d.round,e=d.episode;
  if(s.phase==='lobby') return `<div class="panel"><h2>Waiting to Begin</h2><p>${esc(e.tagline)}</p><p class="muted">Scheduled: ${esc(scheduleText(s))}</p></div>`;
  if(s.phase==='role_reveal') return `<div class="panel goodbox"><h2>You are the ${esc(p.role?.name||'Survivor')}</h2><p><strong>${esc(p.role?.ability||'Ability')}:</strong> ${esc(p.role?.description||'')}</p></div>`;
  if(s.phase==='public_event') return `<div class="panel"><div class="kicker">Public Event</div><h2>${esc(r.title)}</h2><p>${esc(r.publicEvent)}</p><div class="log"><strong>Goal:</strong> ${esc(r.groupGoal)}</div></div>`;
  if(s.phase==='private_scenario') return renderPrivateCard(d);
  if(s.phase==='public_discussion') return `<div class="panel"><h2>Public Discussion</h2><p>Talk openly before the timer ends.</p></div>`;
  if(s.phase==='private_alliance') return renderAlliancePanel(d);
  if(s.phase==='choice_lock') return renderChoiceLock(d);
  if(s.phase==='round_results') return renderRoundResult(d);
  if(s.phase==='final_intro') return `<div class="panel warning"><h2>${esc(e.finalIntroTitle)}</h2><div class="log">${esc(e.finalIntroText)}</div></div>`;
  if(s.phase==='final_choice') return renderFinalChoice(d);
  if(s.phase==='ending') return renderEnding(d);
  return '';
}
function renderPrivateCard(d){const c=d.player.privateCard,chosen=d.player.privateCardDecision?.type;if(!c)return '<div class="panel"><p>Preparing your private scenario.</p></div>';return `<div class="panel"><div class="kicker">Private Scenario</div><h2>${esc(c.title)}</h2><p>${esc(c.text)}</p><div class="grid two">${['reveal','hide','trade','selfish'].map(x=>`<button class="choice-card ${chosen===x?'selected':''}" data-card-decision="${x}" ${chosen?'disabled':''}><h3>${esc(x[0].toUpperCase()+x.slice(1))}</h3></button>`).join('')}</div></div>`;}
function renderChoiceLock(d){const r=d.round,current=d.player.currentChoice?.choiceType;return `<div class="panel"><h2>Choose Your Action</h2><div class="grid three">${['help_group','help_self','take_risk'].map(x=>choiceCard(x,r.choices[x],current)).join('')}</div><button class="btn primary full" id="lockChoiceBtn" ${current?'disabled':''}>${current?'Choice Locked':'Lock Choice'}</button></div>`;}
function choiceCard(type,def,current){return `<button class="choice-card ${current===type?'selected':''}" data-choice="${type}" ${current?'disabled':''}><div class="type">${esc(type.replaceAll('_',' '))}</div><h3>${esc(def.label)}</h3><p>${esc(def.preview)}</p></button>`;}
function renderAlliancePanel(d){const others=d.players.filter(x=>x.id!==d.player.id);return `<div class="grid two"><div class="panel"><h2>Direct Message</h2><form class="form" id="pmForm"><label>Player<select name="toPlayerId">${others.map(x=>`<option value="${x.id}" ${state.privateRecipient===x.id?'selected':''}>${esc(x.alias)}</option>`).join('')}</select></label><label>Message<textarea name="message">${esc(state.drafts.private)}</textarea></label><button class="btn" ${(d.player.privateMessagesUsed||0)>=2?'disabled':''}>Send (${2-(d.player.privateMessagesUsed||0)} left)</button></form></div><div class="panel"><h2>Create Alliance</h2><form class="form" id="allianceForm"><label>Name<input name="name" value="${esc(state.drafts.allianceName)}"></label>${others.map(x=>`<label class="check"><input type="checkbox" name="memberIds" value="${x.id}"> ${esc(x.alias)}</label>`).join('')}<button class="btn">Create</button></form>${d.alliances.length?`<form class="form" id="groupPmForm"><label>Alliance<select name="allianceId">${d.alliances.map(a=>`<option value="${a.id}" ${state.allianceRecipient===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label><label>Message<textarea name="message">${esc(state.drafts.alliance)}</textarea></label><button class="btn" ${d.player.groupMessageUsed?'disabled':''}>Send Group Message</button></form>`:''}</div></div>`;}
function renderRoundResult(d){const x=d.latestResult,changes=x?.playerChanges?.[d.player.id]||{};return `<div class="panel"><h2>${esc(x?.roundTitle||'Round Result')}</h2><div class="log">${esc(x?.publicSummary||'Calculating...')}</div><div class="stat-list">${Object.entries(changes).map(([k,v])=>statCell(k,v,false,false,true)).join('')}</div></div>`;}
function renderFinalChoice(d){const current=d.player.finalChoice,choices=d.episode.finalChoices||{};return `<div class="panel warning"><h2>Final Choice</h2><div class="grid two">${Object.entries(choices).map(([id,c])=>`<button class="choice-card ${current===id?'selected':''}" data-final-choice="${id}" ${current?'disabled':''}><h3>${esc(c.label)}</h3><p>${esc(c.description)}</p></button>`).join('')}</div><button class="btn primary full" id="lockFinalBtn" ${current?'disabled':''}>${current?'Locked':'Lock Final Choice'}</button></div>`;}
function renderEnding(d){return `<div class="panel ${d.final?.outcomeKey==='full'?'goodbox':'warning'}"><h2>${esc(d.final?.outcome||'The End')}</h2><p>${esc(d.final?.endingText||'')}</p><h3>Awards</h3>${(d.awards||[]).map(a=>`<div class="player-row"><strong>${esc(a.name)}</strong><small>${esc(a.alias)}</small></div>`).join('')}<button class="btn" onclick="clearActive()">Return Home</button></div>`;}
function renderPlayerChat(d){const open=['public_discussion','private_alliance','choice_lock'].includes(d.session.phase);return `<div class="panel"><h2>${esc(d.episode.chatTitle||'Public Discussion')}</h2><div class="chatbox">${renderMessages(d.publicChat||[])}</div><form class="form" id="publicChatForm"><label>Message<textarea name="message" ${open?'':'disabled'}>${esc(state.drafts.public)}</textarea></label><button class="btn" ${open?'':'disabled'}>Send</button></form>${d.session.phase==='private_alliance'?`<div class="divider"></div><h3>Your Private Messages</h3><div class="chatbox">${renderPrivateMessages(d.privateMessages||[])}</div>`:''}</div>`;}
function infoModal(d){let body='';if(state.openPanel==='status')body=`<h2>Status</h2><div class="stat-list">${statCells(d.player.stats,true)}</div>`;if(state.openPanel==='group')body=`<h2>Group Status</h2><div class="stat-list">${Object.entries(d.groupStats||{}).map(([k,v])=>statCell(k,v,true,true)).join('')}</div>`;if(state.openPanel==='players')body=`<h2>Players</h2><div class="players">${d.players.map(p=>`<div class="player-row"><strong>${esc(p.alias)}</strong><small>${esc(p.role?.name||'Role hidden')} · ${esc(p.status)}</small></div>`).join('')}</div>`;return `<div class="info-modal" id="infoModal" ${state.openPanel?'':'hidden'}><div class="info-modal__backdrop" data-close-info></div><div class="info-modal__card">${body}<button class="btn primary" data-close-info>Close</button></div></div>`;}
function bindInfoModal(){document.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>{state.openPanel=b.dataset.info;renderPlayer();});document.querySelectorAll('[data-close-info]').forEach(b=>b.onclick=()=>{state.openPanel=null;renderPlayer();});}
function bindPlayerEvents(d){const code=d.session.code,pid=d.player.id;
  document.querySelectorAll('[data-card-decision]').forEach(b=>b.onclick=async()=>{try{await api(`/api/sessions/${code}/players/${pid}/private-card`,{method:'POST',body:{decision:b.dataset.cardDecision}});await fetchState();}catch(err){showToast(err.message);}});
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{state.selectedChoice=b.dataset.choice;document.querySelectorAll('[data-choice]').forEach(x=>x.classList.toggle('selected',x===b));});
  document.getElementById('lockChoiceBtn')?.addEventListener('click',async()=>{if(!state.selectedChoice)return showToast('Choose an action.');try{await api(`/api/sessions/${code}/players/${pid}/choice`,{method:'POST',body:{choiceType:state.selectedChoice}});state.selectedChoice=null;await fetchState();}catch(err){showToast(err.message);}});
  document.querySelectorAll('[data-final-choice]').forEach(b=>b.onclick=()=>{state.selectedFinal=b.dataset.finalChoice;document.querySelectorAll('[data-final-choice]').forEach(x=>x.classList.toggle('selected',x===b));});
  document.getElementById('lockFinalBtn')?.addEventListener('click',async()=>{if(!state.selectedFinal)return showToast('Choose a final action.');try{await api(`/api/sessions/${code}/players/${pid}/final-choice`,{method:'POST',body:{finalChoice:state.selectedFinal}});state.selectedFinal=null;await fetchState();}catch(err){showToast(err.message);}});
  const bindDraft=(sel,key)=>document.querySelector(sel)?.addEventListener('input',e=>state.drafts[key]=e.target.value); bindDraft('#publicChatForm textarea','public');bindDraft('#pmForm textarea','private');bindDraft('#groupPmForm textarea','alliance');bindDraft('#allianceForm input[name="name"]','allianceName');
  document.querySelector('#pmForm select')?.addEventListener('change',e=>state.privateRecipient=e.target.value);document.querySelector('#groupPmForm select')?.addEventListener('change',e=>state.allianceRecipient=e.target.value);
  document.getElementById('publicChatForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await api(`/api/sessions/${code}/players/${pid}/public-message`,{method:'POST',body:{message:state.drafts.public}});state.drafts.public='';await fetchState();}catch(err){showToast(err.message);}});
  document.getElementById('pmForm')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await api(`/api/sessions/${code}/players/${pid}/private-message`,{method:'POST',body:{toPlayerId:fd.get('toPlayerId'),message:state.drafts.private}});state.drafts.private='';await fetchState();}catch(err){showToast(err.message);}});
  document.getElementById('allianceForm')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await api(`/api/sessions/${code}/players/${pid}/alliance`,{method:'POST',body:{name:fd.get('name'),memberIds:fd.getAll('memberIds')}});state.drafts.allianceName='';await fetchState();}catch(err){showToast(err.message);}});
  document.getElementById('groupPmForm')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await api(`/api/sessions/${code}/players/${pid}/private-message`,{method:'POST',body:{allianceId:fd.get('allianceId'),message:state.drafts.alliance}});state.drafts.alliance='';await fetchState();}catch(err){showToast(err.message);}});
}
function renderMessages(ms){return ms.length?ms.map(m=>`<div class="message ${m.system?'system':''}"><div class="meta">${esc(m.alias||'System')}</div><div>${esc(m.message)}</div></div>`).join(''):'<p class="muted">No messages yet.</p>';}
function renderPrivateMessages(ms){return ms.length?ms.map(m=>`<div class="message"><div class="meta">${esc(m.fromAlias||'Unknown')} → ${esc(m.allianceName||m.toAlias||'You')}</div><div>${esc(m.message)}</div></div>`).join(''):'<p class="muted">No private messages yet.</p>';}
function roleName(role){return role?.name||role||'No role';}
function pretty(k){return k.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase());}
function statLabel(k){return ep().statLabels?.[k]||pretty(k);} function groupLabel(k){return ep().groupStatLabels?.[k]||pretty(k);}
function statCells(stats,bars=false){return Object.entries(stats||{}).filter(([k])=>!['helpedGroup','betrayals','riskActions','selfChoices'].includes(k)).map(([k,v])=>statCell(k,v,bars,false)).join('');}
function statCell(k,v,bar=false,group=false,signed=false){const w=Math.max(0,Math.min(100,Number(v)*10));return `<div class="stat"><div class="name">${esc(group?groupLabel(k):statLabel(k))}</div><div class="value">${signed&&v>0?'+':''}${esc(v)}</div>${bar?`<div class="bar"><span style="width:${w}%"></span></div>`:''}</div>`;}

const urlCode=new URLSearchParams(location.search).get('code');
loadEpisodes().then(()=>{
  if(routeMode==='player'&&urlCode){const savedCode=localStorage.getItem('barfly_player_code');if(savedCode&&savedCode!==urlCode.toUpperCase()){localStorage.removeItem('barfly_player_code');localStorage.removeItem('barfly_player_id');}}
  renderHome();
});
