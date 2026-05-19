const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const sessionCode = (params.get('session') || '').toUpperCase();
let sessionInfo = null;

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

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function renderSession(info) {
  sessionInfo = info;
  $('sessionTitle').textContent = info.tableName || 'Fear Garden Check-In';
  $('sessionMeta').textContent = `${info.truthPackTitle || 'Fear Garden'} · ${info.eventDateLabel || 'Date TBD'} · ${info.eventTimeLabel || 'Time TBD'}`;
  $('sessionPills').innerHTML = `
    <span class="pill good">${escapeHtml((info.eventType || 'paid') === 'free' ? 'Free Event' : 'Paid Event')}</span>
    <span class="pill">Checked In ${Number(info.checkedIn || 0)}</span>
    <span class="pill">Reserved ${Number(info.reserved || 0)}</span>
  `;
}

async function loadSession() {
  if (!sessionCode) {
    $('sessionMeta').textContent = 'Missing session code. Please scan the QR code again.';
    $('checkinForm').classList.add('hidden');
    return;
  }
  try {
    const info = await api(`/api/sessions/${encodeURIComponent(sessionCode)}/checkin-info`);
    renderSession(info);
  } catch (err) {
    $('sessionMeta').textContent = err.message || 'Could not load this check-in session.';
    $('checkinForm').classList.add('hidden');
  }
}

$('checkinForm').addEventListener('submit', async evt => {
  evt.preventDefault();
  $('checkinError').textContent = '';
  $('checkinSuccess').classList.add('hidden');
  const payload = {
    sessionCode,
    accessCode: $('accessCode').value.trim()
  };
  try {
    const result = await api('/api/checkins', { method: 'POST', body: payload });
    renderSession(result.session || sessionInfo || {});
    $('checkinSuccess').innerHTML = `<b>Checked In</b><br>${escapeHtml(result.rsvp?.firstName ? 'Welcome, ' + result.rsvp.firstName + '.' : result.message || 'You are checked in.')}<br><a class="buttonLike rsvpCta" href="${escapeHtml(result.playerUrl || ('/player/?access=' + encodeURIComponent(payload.accessCode)))}">Enter Waiting Room</a>`;
    $('checkinSuccess').classList.remove('hidden');
    $('checkinForm').reset();
  } catch (err) {
    $('checkinError').textContent = err.message || 'Could not check you in.';
  }
});

loadSession();
