const $ = id => document.getElementById(id);
let sessions = [];
let packs = [];
let sockets = new Map();
let pollTimer = null;
let activeHostTab = 'upcoming';

$('createBtn').onclick = createSession;
$('refreshBtn').onclick = loadAll;
$('saveDemoCodeBtn').onclick = saveDemoCode;
$('resetDemoBtn').onclick = resetDemoSession;
$('deleteDemoBtn').onclick = deleteDemoSessions;
$('eventType').onchange = syncEventTypeFields;
document.addEventListener('click', event => {
  const tab = event.target?.closest?.('[data-host-tab]');
  if (!tab) return;
  activeHostTab = tab.dataset.hostTab || 'upcoming';
  render();
});
syncEventTypeFields();

function api(path, options = {}) {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(async res => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  });
}


function hostNotify(message, type = 'good') {
  const el = $('hostToast');
  if (!el) { alert(message); return; }
  el.textContent = message;
  el.className = `hostToast ${type}`;
  clearTimeout(hostNotify._timer);
  hostNotify._timer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function resetCreateForm() {
  ['tableName','playerCap','eventDate','eventTime','eventDurationMinutes','sharedAccessCode'].forEach(id => { if ($(id)) $(id).value = ''; });
  if ($('truthPackSelect')) $('truthPackSelect').value = '';
  if ($('eventType')) $('eventType').value = '';
  if ($('ticketPrice')) $('ticketPrice').value = '';
  if ($('eventStatus')) $('eventStatus').value = '';
  if ($('allowLateCheckIn')) $('allowLateCheckIn').value = '';
  syncEventTypeFields();
}

async function loadAll() {
  const settings = await api('/api/settings').catch(() => ({}));
  if ($('demoAccessCode') && settings.demoAccessCode) $('demoAccessCode').value = settings.demoAccessCode;
  packs = await api('/api/truth-packs');
  $('truthPackSelect').innerHTML = '<option value="">Choose game level</option>' + packs.map(p => `<option value="${p.id}">${escapeHtml(p.gameTitle || 'Fear Garden')} — ${escapeHtml(p.levelLabel || p.difficulty || p.title)}</option>`).join('');
  sessions = await api('/api/sessions');
  sessions.forEach(s => connectSocket(s.sessionCode));
  render();
}

async function saveDemoCode() {
  const demoAccessCode = $('demoAccessCode')?.value || '';
  try {
    const settings = await api('/api/settings/demo-access-code', { method: 'POST', body: { demoAccessCode } });
    if ($('demoAccessCode')) $('demoAccessCode').value = settings.demoAccessCode || '';
    hostNotify('Demo access code saved.');
    await loadAll();
  } catch (err) {
    hostNotify(err.message || 'Could not save demo access code.', 'error');
  }
}


async function resetDemoSession() {
  if (!confirm('Reset Demo Mode now? This removes old demo sessions and creates one clean fresh demo session.')) return;
  try {
    const result = await api('/api/demo/reset', { method: 'POST' });
    hostNotify(`Demo reset complete. Fresh demo session: ${result.demoSessionCode || 'created'}.`);
    await loadAll();
  } catch (err) {
    hostNotify(err.message || 'Could not reset demo session.', 'error');
  }
}

async function deleteDemoSessions() {
  if (!confirm('Delete all demo sessions from the dashboard and database? The demo access code will remain active.')) return;
  try {
    const result = await api('/api/demo/sessions', { method: 'DELETE' });
    hostNotify(`Deleted ${result.deleted || 0} demo session${Number(result.deleted || 0) === 1 ? '' : 's'}.`);
    await loadAll();
  } catch (err) {
    hostNotify(err.message || 'Could not delete demo sessions.', 'error');
  }
}

async function createSession() {
  const tableName = $('tableName').value.trim();
  const truthPackId = $('truthPackSelect').value;
  const playerCapRaw = $('playerCap')?.value || '';
  const eventDate = $('eventDate')?.value || '';
  const eventTime = $('eventTime')?.value || '';
  const durationRaw = $('eventDurationMinutes')?.value || '';
  const eventStatus = $('eventStatus')?.value || '';
  const eventType = $('eventType')?.value || '';
  const ticketPrice = $('ticketPrice')?.value || '';
  const allowLateCheckIn = $('allowLateCheckIn')?.value === 'true';
  const sharedAccessCode = $('sharedAccessCode')?.value || '';
  const scheduledStartAt = 0; // Server calculates scheduled start in America/Chicago.
  const autoStartEnabled = true;
  if (!tableName || !truthPackId || !playerCapRaw || !eventDate || !eventTime || !durationRaw || !eventStatus || !eventType) {
    hostNotify('Complete all Create Session fields before creating a session.', 'error');
    return;
  }
  if (eventType === 'paid' && !ticketPrice) {
    hostNotify('Enter a ticket price for paid events.', 'error');
    return;
  }
  const playerCap = Math.max(1, Math.min(100, Number(playerCapRaw)));
  const eventDurationMinutes = Math.max(15, Math.min(240, Number(durationRaw)));
  try {
    const state = await api('/api/sessions', { method: 'POST', body: { tableName, truthPackId, playerCap, eventDate, eventTime, eventDurationMinutes, eventStatus, eventType, ticketPrice, sharedAccessCode, allowLateCheckIn, scheduledStartAt, autoStartEnabled } });
    upsertSession(state);
    connectSocket(state.sessionCode);
    render();
    resetCreateForm();
    hostNotify(`Session has been created. Join code: ${state.sessionCode}`);
  } catch (err) {
    hostNotify(err.message || 'Could not create session.', 'error');
  }
}

function connectSocket(code) {
  if (sockets.has(code)) return;
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}?code=${encodeURIComponent(code)}`);
  sockets.set(code, ws);
  ws.onmessage = evt => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'state') {
      upsertSession(msg.state);
      render();
    }
  };
  ws.onclose = () => {
    sockets.delete(code);
    setTimeout(() => connectSocket(code), 3000);
  };
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      sessions = await api('/api/sessions');
      sessions.forEach(s => connectSocket(s.sessionCode));
      render();
    } catch (_err) {}
  }, 5000);
}

function upsertSession(state) {
  const i = sessions.findIndex(s => s.sessionCode === state.sessionCode);
  if (i >= 0) sessions[i] = { ...sessions[i], ...state, accessCodes: state.accessCodes || sessions[i].accessCodes || [] };
  else sessions.unshift(state);
}

function fmt(sec) {
  sec = Math.max(0, Number(sec || 0));
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function phaseLabel(phase) {
  return ({ lobby: 'Lobby', briefing: 'Briefing', investigation: 'Investigation', accusation: 'Accusation Open', accusation_locked: 'Accusation Locked', revealed: 'Revealed' })[phase] || phase;
}
function instagramText(value) {
  return value ? escapeHtml(value) : '<span class="muted">Not provided</span>';
}

function fullPlayerName(item) {
  const first = item.firstName || '';
  const last = item.lastName || '';
  const full = `${first} ${last}`.trim();
  return full || item.fullName || item.playerName || item.name || 'Detective';
}


function setDefaultEventDateTime() {
  const dateEl = $('eventDate');
  const timeEl = $('eventTime');
  if (dateEl && !dateEl.value) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    dateEl.value = d.toISOString().slice(0, 10);
  }
  if (timeEl && !timeEl.value) timeEl.value = '19:00';
}

function eventLine(s) {
  const date = s.eventDateLabel || s.dateLabel || 'Date TBD';
  const time = s.eventTimeLabel || s.timeLabel || 'Time TBD';
  return `${date} · ${time}`;
}
function sessionTimeValue(s) {
  const raw = s.eventTimestamp || 0;
  const n = Number(raw || 0);
  return Number.isFinite(n) ? n : 0;
}
function sessionBucket(s) {
  if (s.status === 'revealed' || s.revealed || s.eventStatus === 'closed' || s.eventStatus === 'completed') return 'completed';
  if (['briefing','started'].includes(s.status) || ['briefing','investigation','accusation','accusation_locked'].includes(s.phase)) return 'live';
  return 'upcoming';
}
function sessionsForTab() {
  const sorted = [...sessions].sort((a,b) => sessionTimeValue(a) - sessionTimeValue(b));
  const upcoming = sorted.filter(s => sessionBucket(s) === 'upcoming');
  const live = sorted.filter(s => sessionBucket(s) === 'live');
  const completed = sorted.filter(s => sessionBucket(s) === 'completed').sort((a,b) => sessionTimeValue(b) - sessionTimeValue(a));
  const counts = { upcoming: upcoming.length, live: live.length, completed: completed.length };
  if ($('upcomingCount')) $('upcomingCount').textContent = `Upcoming ${counts.upcoming}`;
  if ($('liveCount')) $('liveCount').textContent = `Live ${counts.live}`;
  if ($('completedCount')) $('completedCount').textContent = `Completed ${counts.completed}`;
  document.querySelectorAll('[data-host-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.hostTab === activeHostTab));
  if (activeHostTab === 'all') return [...upcoming, ...live, ...completed];
  if (activeHostTab === 'live') return live;
  if (activeHostTab === 'completed') return completed;
  return upcoming;
}
function hostPrimaryAction(s) {
  if (s.status === 'lobby') return `<button class="good" onclick="startTable('${s.sessionCode}')">Start Briefing Now</button>`;
  if (s.status === 'briefing') return `<button class="good" onclick="sendOpeningNarration('${s.sessionCode}')">Send Opening</button>`;
  if (s.status === 'started') return `<button class="danger" onclick="revealCase('${s.sessionCode}')">Trigger Reveal</button>`;
  if (s.status === 'revealed') return `<button class="secondary" onclick="resetTable('${s.sessionCode}')">Reset for Next Group</button>`;
  return `<button class="secondary" onclick="startTable('${s.sessionCode}')">Start Briefing Now</button>`;
}
function syncEventTypeFields() {
  const type = $('eventType')?.value || '';
  const shared = $('sharedAccessCode');
  const price = $('ticketPrice');
  if (shared) {
    shared.disabled = type !== 'free';
    shared.placeholder = type === 'free' ? 'Auto-generate if blank' : 'Used for free events only';
  }
  if (price) {
    price.disabled = type !== 'paid';
    price.placeholder = type === 'paid' ? 'Example: 10.00' : 'Free events do not need a price';
    if (type !== 'paid') price.value = '';
  }
}

function createLocalScheduledStartAt(eventDate, eventTime) {
  if (!eventDate || !eventTime) return 0;
  const ms = new Date(`${eventDate}T${eventTime}:00`).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function eventTypeLabel(s) {
  if ((s.eventType || 'paid') === 'free') return 'Free Event';
  return s.ticketPrice ? `Paid Event · $${s.ticketPrice}` : 'Paid Event';
}

function render() {
  const visible = sessionsForTab();
  const empty = activeHostTab === 'live' ? 'No live games right now.' : activeHostTab === 'completed' ? 'No completed games yet.' : activeHostTab === 'all' ? 'No table sessions yet.' : 'No upcoming games yet.';
  $('tables').innerHTML = visible.length ? visible.map(tableHtml).join('') : `<p class="muted">${empty}</p>`;
}

function resultHtml(results = []) {
  if (!results.length) return '<p class="muted">No graded results yet.</p>';
  return results.slice(0, 6).map(r => `<div class="feedItem"><div class="time">${escapeHtml(r.badge)}</div><h4>${escapeHtml(r.playerName)}</h4><p><b>Score:</b> ${r.score}/${r.total}</p></div>`).join('');
}

function submissionHtml(submissions = [], accusation) {
  const questions = accusation?.questions || [];
  if (!submissions.length) return '<p class="muted">No submissions yet.</p>';
  return submissions.slice(0, 4).map(sub => {
    const lines = questions.map(q => {
      const option = (q.options || []).find(opt => opt.id === sub.answers?.[q.id]);
      return `<b>${escapeHtml(q.prompt)}</b><br>${escapeHtml(option?.label || 'No answer')}`;
    }).join('<br><br>');
    return `<div class="feedItem"><div class="time">${new Date(sub.createdAt).toLocaleTimeString()}</div><h4>${escapeHtml(sub.playerName)}</h4><p>${lines}</p></div>`;
  }).join('');
}



function rsvpHtml(s) {
  const rsvps = s.rsvps || [];
  if (!rsvps.length) return '<p class="muted">No RSVPs yet. Players can RSVP from the public player page without the host dashboard being open.</p>';
  const rows = rsvps.map(item => {
    const code = item.accessCode || '';
    const checked = item.checkedIn ? 'Checked In' : 'Not Checked In';
    const checkedClass = item.checkedIn ? 'pill good' : 'pill';
    const isFree = (s.eventType || 'paid') === 'free';
    const paidText = isFree ? 'Free' : (item.paid ? 'Paid' : 'Unpaid');
    const codeCell = isFree
      ? `<button class="secondary codeButton" onclick="copyText('${escapeHtml(s.sharedAccessCode || code || '')}')">${escapeHtml(s.sharedAccessCode || code || 'Shared Code')}</button>`
      : (item.paid && code ? `<button class="secondary codeButton" onclick="copyText('${escapeHtml(code)}')">${escapeHtml(code)}</button>` : '<span class="muted">Hidden until paid</span>');
    const paidCell = isFree ? '<span class="pill good">Free</span>' : `<button class="secondary compact" onclick="toggleRsvpPaid('${s.sessionCode}','${escapeHtml(item.id)}',${item.paid ? 'false' : 'true'})">${item.paid ? 'Paid / Activated' : 'Mark Paid / Activate Code'}</button>`;
    const actionCell = isFree ? '<span class="muted">Shared code</span>' : (item.paid && code ? `<button class="secondary compact" onclick="copyText('${escapeHtml(code)}')">Copy Code</button>` : `<button class="secondary compact" onclick="assignRsvpCode('${s.sessionCode}','${escapeHtml(item.id)}')">Mark Paid / Activate Code</button>`);
    const checkInCell = `<button class="${item.checkedIn ? 'secondary' : 'good'} compact" onclick="manualRsvpCheckIn('${s.sessionCode}','${escapeHtml(item.id)}',${item.checkedIn ? 'false' : 'true'})">${item.checkedIn ? 'Undo Check-In' : 'Check In'}</button>`;
    const deleteCell = `<button class="danger compact" onclick="deleteRsvp('${s.sessionCode}','${escapeHtml(item.id)}')">Delete RSVP</button>`;
    return `<tr>
      <td>${escapeHtml(item.firstName || '—')}</td>
      <td>${instagramText(item.instagram || item.socialMedia || '')}</td>
      <td>${escapeHtml(item.contact || '—')}</td>
      <td><span class="${checkedClass}">${escapeHtml(checked)}</span></td>
      <td>${codeCell}</td>
      <td>${paidCell}</td>
      <td>${checkInCell}</td>
      <td>${actionCell}</td>
      <td>${deleteCell}</td>
    </tr>`;
  }).join('');
  return `<div class="tableScroll"><table class="codeTable"><thead><tr><th>First</th><th>Social</th><th>Phone</th><th>Status</th><th>Code</th><th>Payment</th><th>Host Check-In</th><th>Code Action</th><th>Delete</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function accessCodeHtml(s) {
  if ((s.eventType || 'paid') === 'free') {
    return `<div class="feedItem"><div class="time">Free Event</div><h4>Shared Access Code</h4><p><button class="secondary codeButton" onclick="copyText('${escapeHtml(s.sharedAccessCode || '')}')">${escapeHtml(s.sharedAccessCode || 'Not Set')}</button></p><p class="mini">Everyone uses this same code. Capacity is still limited by the player spots for this session.</p></div>`;
  }
  const codes = s.accessCodes || [];
  if (!codes.length) return '<p class="muted">No access codes generated for this session.</p>';
  const rows = codes.map(item => {
    const status = item.claimed ? 'Claimed' : 'Unused';
    const paidText = item.paid ? 'Paid' : 'Unpaid';
    const firstName = item.firstName || '';
    const lastName = item.lastName || '';
    return `<tr>
      <td><button class="secondary codeButton" onclick="copyText('${escapeHtml(item.code)}')">${escapeHtml(item.code)}</button></td>
      <td>${escapeHtml(status)}</td>
      <td>${escapeHtml(firstName || '—')}</td>
      <td>${escapeHtml(lastName || '—')}</td>
      <td>${instagramText(item.instagram || '')}</td>
      <td><button class="secondary compact" onclick="togglePaid('${s.sessionCode}','${escapeHtml(item.code)}',${item.paid ? 'false' : 'true'})">${paidText}</button></td>
    </tr>`;
  }).join('');
  return `<div class="codeTools"><button class="secondary" onclick="copyAllCodes('${s.sessionCode}')">Copy All Codes</button></div><div class="tableScroll"><table class="codeTable"><thead><tr><th>Access Code</th><th>Status</th><th>First</th><th>Last</th><th>Instagram</th><th>Paid</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}


function checkInHtml(s) {
  const link = `${location.origin}/checkin/?session=${encodeURIComponent(s.sessionCode)}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(link)}`;
  return `<div class="checkinBox">
    <div>
      <h4>Venue Check-In QR</h4>
      <p class="mini">Post this QR code at the event. Players scan it, enter their name and access code, and are marked Checked In on the RSVP list. This does not start the game.</p>
      <input readonly value="${escapeHtml(link)}" onclick="this.select();navigator.clipboard?.writeText(this.value)" />
      <div class="actions compactButtons" style="margin-top:10px">
        <button class="secondary" onclick="copyText('${escapeHtml(link)}')">Copy Check-In Link</button>
        <button class="secondary" onclick="window.open('${escapeHtml(link)}','_blank')">Open Check-In Page</button>
      </div>
    </div>
    <div class="qrCodeBox smallQr"><img src="${qr}" alt="Check-in QR code for ${escapeHtml(s.tableName)}" /></div>
  </div>`;
}

function tableHtml(s) {
  const playerList = s.players.length ? s.players.map(p => `<span class="pill ${p.connected ? 'good' : ''}">${escapeHtml(fullPlayerName(p))}${p.instagram ? ` · ${escapeHtml(p.instagram)}` : ''} ${p.connected ? '●' : '○'}</span>`).join(' ') : '<span class="muted">No players connected.</span>';
  const help = (s.helpRequests || []).slice(0, 4).map(h => `<div class="feedItem"><div class="time">${new Date(h.createdAt).toLocaleTimeString()}</div><h4>${escapeHtml(h.playerName)}</h4>${h.text ? `<p>${escapeHtml(h.text)}</p>` : ''}</div>`).join('') || '<p class="muted">No help requests.</p>';
  const messages = (s.hostMessages || []).slice(-3).reverse().map(m => `<div class="feedItem hostMsg"><div class="time">${new Date(m.createdAt).toLocaleTimeString()}</div><h4>${escapeHtml(m.title || 'Host')}</h4><p>${escapeHtml(m.text)}</p></div>`).join('') || '<p class="muted">No host dialogue sent yet.</p>';
  const playerUrl = `${location.origin}/player/`;
  const roundHtml = (s.rounds || []).map(r => {
    const cls = s.currentRound?.id === r.id ? 'roundNode active' : (s.elapsedSec >= r.endSec ? 'roundNode done' : 'roundNode');
    return `<div class="${cls}"><b>${escapeHtml(r.shortTitle || r.title)}</b><small>${fmt(r.startSec)} - ${fmt(r.endSec)}</small></div>`;
  }).join('');
  const currentScript = s.currentRound?.dialogue || 'Start the game to begin the hosted narration flow.';
  const openingScript = s.openingNarration || 'No opening narration loaded.';
  const revealScript = s.revealScript || 'No reveal script loaded.';
  return `
    <article class="tableCard">
      <div class="row">
        <div>
          <h3>${escapeHtml(eventLine(s))} — ${escapeHtml(s.tableName)} · ${escapeHtml(s.sessionCode)}</h3>
          <p class="mini">${escapeHtml(s.truthPackTitle)} · ${escapeHtml(s.difficultyLabel || s.difficulty || '')} · ${escapeHtml(eventLine(s))} · ${escapeHtml(eventTypeLabel(s))} · Detective Mode · Unified Evidence</p>
        </div>
        <div class="statusPills">
          <span class="pill">${phaseLabel(s.phase)}</span>
          <span class="pill">${sessionBucket(s) === 'upcoming' ? 'RSVP Visible' : sessionBucket(s) === 'live' ? 'RSVP Hidden' : 'Completed'}</span>
          <span class="pill">${s.currentRound ? escapeHtml(s.currentRound.title) : 'No Round Yet'}</span>
          <span class="pill good">Left ${fmt(s.remainingSec)}</span>
          <span class="pill">Elapsed ${fmt(s.elapsedSec)}</span>
          <span class="pill">${s.players.length} Detectives</span>
          <span class="pill">${escapeHtml(eventTypeLabel(s))}</span>
          <span class="pill">Codes ${s.access?.used || 0}/${s.access?.playerCap || s.playerCap || 25}</span>
          <span class="pill">RSVP ${s.rsvp?.total || 0}</span>
          <span class="pill">Late Check-In ${s.allowLateCheckIn ? 'On' : 'Off'}</span>
          <span class="pill">Auto-Start ${s.autoStartEnabled === false ? 'Off' : 'Scheduled'}</span>
        </div>
      </div>
      <label>Player Join URL</label>
      <input readonly value="${playerUrl}" onclick="this.select();navigator.clipboard?.writeText(this.value)" />
      <div class="hostPrimaryAction">${hostPrimaryAction(s)}</div>
      <p class="mini">Auto-start uses the scheduled server/session time${s.scheduledStartLabel ? `: <b>${escapeHtml(s.scheduledStartLabel)}</b>` : ''}. The manual button is only a backup and does not require every player to be connected.</p>
      <div class="actions" style="margin-top:12px">
        <button class="good" onclick="startTable('${s.sessionCode}')">Start Briefing Now</button>
        <button class="secondary" onclick="sendOpeningNarration('${s.sessionCode}')">Opening Popup</button>
        <button class="secondary" onclick="sendRoundDialogue('${s.sessionCode}')">Round Popup</button>
        <button class="secondary" onclick="sendHostMessage('${s.sessionCode}')">Custom Popup</button>
        <button class="danger" onclick="revealCase('${s.sessionCode}')">Reveal Case</button>
        <button class="secondary" onclick="resetTable('${s.sessionCode}')">Reset Session</button>
        <button class="danger" onclick="deleteSession('${s.sessionCode}')">Delete Session</button>
      </div>
      <div class="card" style="box-shadow:none"><h3>Check-In QR</h3>${checkInHtml(s)}<p class="mini">Late check-in after start is <b>${s.allowLateCheckIn ? 'allowed' : 'closed'}</b> for this session.</p></div>
      <div class="card" style="box-shadow:none">
        <h3>Testing Controls</h3>
        <div class="actions compactButtons">
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 1)">Body</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 2)">Timeline</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 3)">Digital</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 4)">Money</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 5)">Cover-Up</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 6)">Accuse</button>
          <button class="secondary" onclick="shiftTime('${s.sessionCode}', -60)">-1m</button>
          <button class="secondary" onclick="shiftTime('${s.sessionCode}', 60)">+1m</button>
          <button class="secondary" onclick="shiftTime('${s.sessionCode}', 300)">+5m</button>
        </div>
      </div>
      <div class="card" style="box-shadow:none">
        <h3>Round Structure</h3>
        <p class="mini">Current objective: ${escapeHtml(s.currentRound?.objective || 'Waiting to start the case.')}</p>
        <div class="timeline">${roundHtml}</div>
      </div>
      <div class="grid">
        <div class="card" style="box-shadow:none">
          <h3>Current Host Script</h3>
          <div class="feedItem"><div class="time">Current Round</div><p>${escapeHtml(currentScript)}</p></div>
          <div class="feedItem"><div class="time">Opening</div><p>${escapeHtml(openingScript)}</p></div>
          <div class="feedItem"><div class="time">Reveal</div><p>${escapeHtml(revealScript)}</p></div>
        </div>
        <div class="card" style="box-shadow:none">
          <h3>Connected Detectives</h3>
          <div>${playerList}</div>
          <h3 style="margin-top:14px">Host Dialogue Log</h3>
          ${messages}
        </div>
      </div>
      <div class="card" style="box-shadow:none"><h3>RSVP List</h3><p class="mini">Each RSVP equals one player spot. Paid event codes stay hidden until the host marks the RSVP paid/activated.</p>${rsvpHtml(s)}</div>
      <div class="card" style="box-shadow:none"><h3>${(s.eventType || 'paid') === 'free' ? 'Free Event Shared Access Code' : 'Paid Player Access Codes'}</h3><p class="mini">${(s.eventType || 'paid') === 'free' ? 'Everyone uses the same code for this free session.' : 'Give one unique code to each paid player. Each code can be claimed once.'}</p>${accessCodeHtml(s)}</div>
      <div class="grid">
        <div class="card" style="box-shadow:none"><h3>Help Requests</h3>${help}</div>
        <div class="card" style="box-shadow:none"><h3>Accusations</h3>${submissionHtml(s.submissions, s.accusation)}</div>
      </div>
      <div class="card" style="box-shadow:none"><h3>Graded Results</h3>${resultHtml(s.results)}</div>
    </article>`;
}

window.startTable = async code => {
  try {
    await api(`/api/sessions/${code}/start`, { method: 'POST' });
    const session = sessions.find(s => s.sessionCode === code);
    await api(`/api/sessions/${code}/message`, {
      method: 'POST',
      body: { title: 'Opening Briefing', text: session?.openingNarration || 'Detectives, the case is beginning.', kind: 'opening' }
    });
    hostNotify('Briefing has started. Players in the waiting room will enter the case setup.');
  } catch (err) { hostNotify(err.message || 'Could not start game.', 'error'); }
};
window.resetTable = async code => {
  if (!confirm('Reset this table? This will clear players, answers, messages, results, timer state, and activity.')) return;
  try { await api(`/api/sessions/${code}/reset`, { method: 'POST' }); hostNotify('Session has been reset.'); }
  catch (err) { hostNotify(err.message || 'Could not reset session.', 'error'); }
};
window.deleteSession = async code => {
  if (!confirm('Delete this session permanently? This removes the join code, players, messages, answers, results, and all saved activity.')) return;
  try {
    await api(`/api/sessions/${code}`, { method: 'DELETE' });
    sessions = sessions.filter(s => s.sessionCode !== code);
    render();
    hostNotify('Session has been deleted.');
  } catch (err) { hostNotify(err.message || 'Could not delete session.', 'error'); }
};
window.revealCase = async code => { try { await api(`/api/sessions/${code}/reveal`, { method: 'POST' }); hostNotify('Reveal has been triggered.'); } catch (err) { hostNotify(err.message || 'Could not reveal case.', 'error'); } };
window.sendHostMessage = async code => {
  const text = prompt('Host dialogue popup text:');
  if (!text) return;
  const title = prompt('Popup title:', 'Host Update');
  await api(`/api/sessions/${code}/message`, { method: 'POST', body: { title: title || 'Host Update', text, kind: 'dialog' } });
  hostNotify('Host popup sent.');
};
window.sendRoundDialogue = async code => {
  const session = sessions.find(s => s.sessionCode === code);
  if (!session?.currentRound) return alert('No active round is available yet. Start the game first.');
  await api(`/api/sessions/${code}/message`, {
    method: 'POST',
    body: { title: session.currentRound.title, text: session.currentRound.dialogue || session.currentRound.objective || 'Review the newly unlocked evidence.', kind: 'dialog' }
  });
  hostNotify('Round popup sent.');
};
window.sendOpeningNarration = async code => {
  const session = sessions.find(s => s.sessionCode === code);
  await api(`/api/sessions/${code}/message`, {
    method: 'POST',
    body: { title: 'Opening Briefing', text: session?.openingNarration || 'Detectives, the case is beginning.', kind: 'opening' }
  });
  hostNotify('Opening popup sent.');
};
window.jumpToRound = async (code, n) => {
  const session = sessions.find(s => s.sessionCode === code);
  const round = session?.rounds?.[n - 1];
  if (!round) return;
  await api(`/api/sessions/${code}/set-elapsed`, { method: 'POST', body: { elapsedSec: round.startSec, pushRoundPopup: true } });
  hostNotify(`Jumped to ${round.title}.`);
};
window.shiftTime = async (code, delta) => {
  const session = sessions.find(s => s.sessionCode === code);
  const elapsed = Math.max(0, Math.min(session.totalSec, Number(session.elapsedSec || 0) + Number(delta || 0)));
  await api(`/api/sessions/${code}/set-elapsed`, { method: 'POST', body: { elapsedSec: elapsed } });
  hostNotify('Game time updated.');
};


window.copyText = async text => {
  try { await navigator.clipboard.writeText(text); hostNotify('Code copied.'); } catch (_err) { hostNotify('Copy failed. Select and copy the code manually.', 'error'); }
};
window.copyAllCodes = async code => {
  const session = sessions.find(s => s.sessionCode === code);
  const lines = (session?.accessCodes || []).map(item => `${item.code}${item.paid ? ' - Paid' : ' - Unpaid'}${item.claimed ? ` - ${fullPlayerName(item)}${item.instagram ? ` - ${item.instagram}` : ''}` : ''}`);
  try { await navigator.clipboard.writeText(lines.join('\n')); hostNotify('Access codes copied.'); } catch (_err) { alert(lines.join('\n')); }
};
window.togglePaid = async (sessionCode, accessCode, paid) => {
  const state = await api(`/api/sessions/${sessionCode}/access-codes/${accessCode}/paid`, { method: 'POST', body: { paid } });
  upsertSession(state);
  render();
  hostNotify(paid ? 'Access code marked paid.' : 'Access code marked unpaid.');
};


window.toggleRsvpPaid = async (sessionCode, rsvpId, paid) => {
  const state = await api(`/api/sessions/${sessionCode}/rsvps/${rsvpId}/paid`, { method: 'POST', body: { paid } });
  upsertSession(state);
  render();
  hostNotify(paid ? 'RSVP marked paid.' : 'RSVP marked unpaid.');
};

window.manualRsvpCheckIn = async (sessionCode, rsvpId, checkedIn) => {
  const state = await api(`/api/sessions/${sessionCode}/rsvps/${rsvpId}/check-in`, { method: 'POST', body: { checkedIn } });
  upsertSession(state);
  render();
  hostNotify(checkedIn ? 'Player has been checked in.' : 'Check-in has been undone.');
};

window.assignRsvpCode = async (sessionCode, rsvpId) => {
  const state = await api(`/api/sessions/${sessionCode}/rsvps/${rsvpId}/assign-code`, { method: 'POST', body: {} });
  upsertSession(state);
  render();
  hostNotify('Access code assigned.');
};


window.deleteRsvp = async (sessionCode, rsvpId) => {
  const ok = confirm('Delete this RSVP? This frees the RSVP spot and unassigns that access code.');
  if (!ok) return;
  const state = await api(`/api/sessions/${sessionCode}/rsvps/${rsvpId}`, { method: 'DELETE' });
  upsertSession(state);
  render();
  hostNotify('RSVP has been deleted.');
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

loadAll();
startPolling();
