const APP_META = {
  casefeed: ['🕵️','Case Feed'],
  phone: ['📞','Phone'],
  messages: ['💬','Messages'],
  maps: ['🗺️','Maps'],
  bank: ['🏦','Bank'],
  photos: ['📷','Photos'],
  social: ['📱','Social'],
  contacts: ['👥','Contacts'],
  notes: ['📝','Notes'],
  files: ['📁','Files'],
  browser: ['🌐','Browser'],
  accuse: ['⚖️','Questions']
};
const BARFLY_APP_URL = 'https://app.barfly.social/home';
const $ = id => document.getElementById(id);

let state = null;
let playerId = localStorage.getItem('detectivePlayerId') || '';
let currentApp = null;
let ws = null;
let pollTimer = null;
let previousCounts = {};
let previousHostMessageCount = 0;
let dialogQueue = [];
let dialogOpen = false;
let activeSessionKey = '';
let splashTimer = null;
let imageCache = {};
let lastBadgeKey = '';
let activeDialogAction = null;
let rsvpSessions = [];
let selectedRsvpSessionCode = '';
const TERMS_STORAGE_KEY = 'fearGardenTermsAccepted_v1';
let pendingTermsAction = null;

const params = new URLSearchParams(location.search);
if (params.get('access')) $('accessCode').value = params.get('access').toUpperCase();
else $('accessCode').value = '';
if (localStorage.getItem('detectiveFirstName')) $('firstName').value = localStorage.getItem('detectiveFirstName');
if (localStorage.getItem('detectiveLastName')) $('lastName').value = localStorage.getItem('detectiveLastName');
if (localStorage.getItem('detectiveInstagram')) $('instagramHandle').value = localStorage.getItem('detectiveInstagram');
if ($('rsvpFirstName') && localStorage.getItem('detectiveFirstName')) $('rsvpFirstName').value = localStorage.getItem('detectiveFirstName');
if ($('rsvpLastName') && localStorage.getItem('detectiveLastName')) $('rsvpLastName').value = localStorage.getItem('detectiveLastName');
if ($('rsvpInstagram') && localStorage.getItem('detectiveInstagram')) $('rsvpInstagram').value = localStorage.getItem('detectiveInstagram');
if ($('rsvpContact') && localStorage.getItem('detectiveContact')) $('rsvpContact').value = localStorage.getItem('detectiveContact');

$('joinBtn').onclick = () => requireTermsAcceptance(join);
$('rsvpBtn').onclick = () => requireTermsAcceptance(() => { setIntroStage('rsvp'); loadRsvpSessions(); });
$('rsvpBackBtn').onclick = () => setIntroStage('title');
$('submitRsvpBtn').onclick = () => requireTermsAcceptance(submitRsvp);
$('rsvpChangeSessionBtn').onclick = showRsvpBrowser;
['rsvpDateFilter'].forEach(id => { if ($(id)) $(id).addEventListener('change', renderRsvpBrowser); });
$('helpBtn').onclick = () => requestHelp();
$('accuseHelpBtn').onclick = () => requestHelp();
$('helpLobbyBtn').onclick = () => requestHelp('Lobby help requested');
$('submitAccuseBtn').onclick = submitAccusation;
$('dialogOkBtn').onclick = dismissDialog;
$('dialogViewBtn').onclick = () => { const action = activeDialogAction; dismissDialog(); if (typeof action === 'function') action(); };
$('enterInvestigationBtn').onclick = () => requireTermsAcceptance(() => setIntroStage('join'));
if ($('shareGameBtn')) $('shareGameBtn').onclick = openShareLinkModal;
if ($('closeShareLinkBtn')) $('closeShareLinkBtn').onclick = closeShareLinkModal;
if ($('copyShareLinkBtn')) $('copyShareLinkBtn').onclick = copyShareLink;
if ($('nativeShareBtn')) $('nativeShareBtn').onclick = nativeShareGameLink;
$('backToTitleBtn').onclick = () => setIntroStage('title');
$('detailHomeBtn').onclick = goHomeDashboard;
$('accuseHomeBtn').onclick = goHomeDashboard;
$('revealReturnBtn').onclick = returnToExternalApp;
$('findNewGameBtn').onclick = findNewGame;
$('shareBadgeBtn').onclick = shareBadge;
$('downloadBadgeBtn').onclick = downloadBadge;
if ($('termsAgreeBtn')) $('termsAgreeBtn').onclick = acceptTermsAndContinue;
if ($('termsCancelBtn')) $('termsCancelBtn').onclick = closeTermsOverlay;
$('accessCode').addEventListener('blur', () => { const code = $('accessCode').value.trim().toUpperCase(); if (code.length >= 7) loadAccessPreview(code); });
$('accessCode').addEventListener('input', () => { const code = $('accessCode').value.trim().toUpperCase(); if (code.length >= 7) loadAccessPreview(code); else updateLevelLabels(null); });
document.addEventListener('click', event => {
  const option = event.target?.closest?.('.choiceOption');
  if (!option) return;
  const input = option.querySelector('input[type="radio"]');
  if (!input || input.disabled) return;
  input.checked = true;
  syncChoiceHighlights();
  saveQuestionAnswer(input).catch(() => {});
});
document.addEventListener('change', event => {
  if (String(event.target?.name || '').startsWith('accuse-')) {
    syncChoiceHighlights();
    saveQuestionAnswer(event.target).catch(() => {});
  }
});



function getGameShareUrl() {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function openShareLinkModal() {
  const shareUrl = getGameShareUrl();
  if ($('shareLinkInput')) $('shareLinkInput').value = shareUrl;
  if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Scan or share this link so players can open the game.';
  if ($('shareQrImg')) {
    $('shareQrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(shareUrl)}`;
  }
  $('shareLinkOverlay')?.classList.remove('hidden');
}

function closeShareLinkModal() {
  $('shareLinkOverlay')?.classList.add('hidden');
}

async function copyShareLink() {
  const shareUrl = getGameShareUrl();
  try {
    await navigator.clipboard.writeText(shareUrl);
    if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Link copied.';
  } catch (_err) {
    if ($('shareLinkInput')) {
      $('shareLinkInput').focus();
      $('shareLinkInput').select();
    }
    if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Copy the highlighted link manually.';
  }
}

async function nativeShareGameLink() {
  const shareUrl = getGameShareUrl();
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Fear Garden',
        text: 'RSVP or join Fear Garden: A Live Detective Mystery Experience.',
        url: shareUrl
      });
      if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Share sheet opened.';
      return;
    } catch (_err) {}
  }
  await copyShareLink();
}

function hasAcceptedTerms() {
  return localStorage.getItem(TERMS_STORAGE_KEY) === 'yes';
}

function requireTermsAcceptance(nextAction) {
  if (hasAcceptedTerms()) {
    if (typeof nextAction === 'function') nextAction();
    return;
  }
  pendingTermsAction = nextAction;
  if ($('termsAcceptCheck')) $('termsAcceptCheck').checked = false;
  if ($('termsError')) $('termsError').textContent = '';
  $('termsOverlay').classList.remove('hidden');
}

function acceptTermsAndContinue() {
  if (!$('termsAcceptCheck')?.checked) {
    $('termsError').textContent = 'You must check the acknowledgment box before continuing.';
    return;
  }
  localStorage.setItem(TERMS_STORAGE_KEY, 'yes');
  closeTermsOverlay();
  const next = pendingTermsAction;
  pendingTermsAction = null;
  if (typeof next === 'function') next();
}

function closeTermsOverlay() {
  $('termsOverlay')?.classList.add('hidden');
  pendingTermsAction = null;
}

startIntro();
if (params.get('access')) loadAccessPreview(params.get('access').toUpperCase());

function startIntro() {
  clearTimeout(splashTimer);
  setIntroStage('title');
}

function setIntroStage(stage) {
  toggleScreen('splashScreen', stage === 'splash');
  toggleScreen('titleScreen', stage === 'title');
  toggleScreen('rsvpScreen', stage === 'rsvp');
  toggleScreen('joinScreen', stage === 'join');
}

function toggleScreen(id, yes) {
  $(id).classList.toggle('hidden', !yes);
  $(id).classList.toggle('visible', yes);
}

function goHomeDashboard() {
  currentApp = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function returnToExternalApp() {
  location.href = BARFLY_APP_URL;
}

function findNewGame() {
  try { if (ws) ws.close(); } catch (_err) {}
  ws = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  state = null;
  currentApp = null;
  activeSessionKey = '';
  $('appTopbar').classList.add('hidden');
  $('appMain').classList.add('hidden');
  $('introRoot').classList.remove('hidden');
  setIntroStage('rsvp');
  loadRsvpSessions();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateLevelLabels(s = state) {
  const label = s?.difficultyLabel || s?.levelLabel || 'DIFFICULTY SET BY HOST';
  const diff = s?.levelLabel || s?.difficulty || '';
  if ($('titleDifficultyBadge')) $('titleDifficultyBadge').textContent = label;
  if ($('topbarSubtitle')) $('topbarSubtitle').textContent = `Barfly Social Presents · Beer Garden${diff ? ` · ${diff}` : ''}`;
}

async function loadAccessPreview(code) {
  try {
    const preview = await api(`/api/access/${encodeURIComponent(code)}/preview`);
    updateLevelLabels(preview);
  } catch (_err) {}
}


async function loadRsvpSessions() {
  const msg = $('rsvpMessage');
  msg.textContent = 'Loading available investigations...';
  selectedRsvpSessionCode = '';
  if ($('rsvpSession')) $('rsvpSession').value = '';
  showRsvpBrowser();
  try {
    rsvpSessions = await api('/api/rsvp-sessions');
    buildRsvpFilters();
    renderRsvpBrowser();
  } catch (err) {
    rsvpSessions = [];
    $('rsvpShowtimeList').innerHTML = '<p class="muted">Unable to load available investigations.</p>';
    msg.textContent = err.message || 'Unable to load RSVP sessions.';
  }
}

function buildRsvpFilters() {
  fillFilter('rsvpDateFilter', rsvpSessions.map(s => s.dateLabel || 'Date TBD'), 'Choose Date');
  const dateEl = $('rsvpDateFilter');
  if (dateEl && !dateEl.value && dateEl.options.length > 1) {
    dateEl.selectedIndex = 1;
  }
}

function fillFilter(id, values, allLabel) {
  const el = $(id);
  if (!el) return;
  const unique = [...new Set(values.filter(Boolean))];
  el.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>` + unique.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function renderRsvpBrowser() {
  const msg = $('rsvpMessage');
  const list = $('rsvpShowtimeList');
  const date = $('rsvpDateFilter')?.value || '';
  if (!rsvpSessions.length) {
    list.innerHTML = '<p class="muted">No RSVP dates are available yet. Check back after the host creates upcoming sessions.</p>';
    msg.textContent = 'No RSVP sessions are available yet.';
    return;
  }
  if (!date) {
    list.innerHTML = '<p class="muted">Choose a date to see available sessions.</p>';
    msg.textContent = 'Choose a date first.';
    return;
  }
  const filtered = rsvpSessions.filter(item => item.dateLabel === date);
  if (!filtered.length) {
    list.innerHTML = '<p class="muted">No sessions are available on this date. Choose another date.</p>';
    msg.textContent = 'No sessions are available for the selected date.';
    return;
  }
  const openCount = filtered.filter(item => item.status !== 'soldout' && Number(item.seatsAvailable ?? item.spotsAvailable ?? 0) > 0).length;
  list.innerHTML = `
    <div class="showtimeDateGroup activeDateGroup">
      <h3>${escapeHtml(date)}</h3>
      <p class="dateAvailabilitySummary">${openCount} available session${openCount === 1 ? '' : 's'} on this date</p>
      ${filtered.map(showtimeCardHtml).join('')}
    </div>`;
  msg.textContent = 'Tap an available time to reserve your detective spot.';
  list.querySelectorAll('[data-session-code]').forEach(btn => {
    btn.addEventListener('click', () => selectRsvpSession(btn.dataset.sessionCode));
  });
}

function groupBy(items, fn) {
  return items.reduce((acc, item) => {
    const key = fn(item);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
}

function showtimeCardHtml(item) {
  const left = Number(item.seatsAvailable ?? item.spotsAvailable ?? 0);
  const soldOut = item.status === 'soldout' || left <= 0;
  const status = soldOut ? 'Sold Out' : `${left} seats left`;
  const buttonLabel = soldOut ? 'Sold Out' : 'Select';
  const disabled = soldOut ? 'disabled' : '';
  const eventType = item.eventType === 'free' ? 'Free Event' : 'Paid Event';
  return `<article class="showtimeCard">
    <div>
      <div class="time">${escapeHtml(item.timeLabel || 'Time TBD')}</div>
      <h4>${escapeHtml(item.mysteryTitle || item.mystery || 'Fear Garden')}</h4>
      <p>${escapeHtml(item.levelLabel || item.difficultyLabel || item.difficulty || 'Skill level TBD')} · ${escapeHtml(item.venue || 'Mid City Beer Garden')}</p>
      <div class="statusPills"><span class="pill ${soldOut ? '' : 'good'}">${escapeHtml(status)}</span><span class="pill">${escapeHtml(eventType)}</span><span class="pill">${escapeHtml(String(item.eventDurationMinutes || 45))} min</span><span class="pill">${escapeHtml(item.tableName || 'Session')}</span></div>
    </div>
    <button type="button" class="showtimeBtn" data-session-code="${escapeHtml(item.sessionCode)}" ${disabled}>${buttonLabel}</button>
  </article>`;
}

function selectRsvpSession(code) {
  const item = rsvpSessions.find(s => s.sessionCode === code);
  if (!item) return;
  selectedRsvpSessionCode = code;
  $('rsvpSession').value = code;
  $('selectedSessionCard').innerHTML = `<div class="time">Selected Showtime</div>
    <h3>${escapeHtml(item.mysteryTitle || item.mystery || 'Fear Garden')}</h3>
    <p><b>${escapeHtml(item.dateLabel || 'Date TBD')} · ${escapeHtml(item.timeLabel || 'Time TBD')}</b></p>
    <p>${escapeHtml(item.levelLabel || item.difficultyLabel || item.difficulty || 'Skill Level TBD')} · ${escapeHtml(item.venue || 'Mid City Beer Garden • Baton Rouge, Louisiana')}</p>
    <p class="mini">${escapeHtml(item.eventType === 'free' ? 'Free shared-code event' : 'Paid unique-code event')} · ${escapeHtml(String(item.eventDurationMinutes || 45))}-minute session · ${escapeHtml(String(item.seatsAvailable ?? item.spotsAvailable ?? 0))} seats left out of ${escapeHtml(String(item.playerCap || 25))}</p>`;
  $('rsvpBrowserPanel').classList.add('hidden');
  $('rsvpReservePanel').classList.remove('hidden');
  $('rsvpMessage').textContent = 'Enter your RSVP information. Instagram is optional.';
  setTimeout(() => $('rsvpFirstName')?.focus(), 80);
}

function showRsvpBrowser() {
  selectedRsvpSessionCode = '';
  if ($('rsvpSession')) $('rsvpSession').value = '';
  $('rsvpBrowserPanel').classList.remove('hidden');
  $('rsvpReservePanel').classList.add('hidden');
  $('rsvpMessage').textContent = 'Choose a date and select an available investigation.';
}

async function submitRsvp() {
  const msg = $('rsvpMessage');
  const sessionCode = selectedRsvpSessionCode || $('rsvpSession').value;
  const firstName = $('rsvpFirstName').value.trim();
  const lastName = $('rsvpLastName').value.trim();
  const contact = $('rsvpContact').value.trim();
  const instagram = $('rsvpInstagram').value.trim();
  const guestCount = 1;
  const teamName = $('rsvpTeamName').value.trim();
  msg.textContent = '';
  if (!sessionCode || !firstName || !lastName || !contact) {
    msg.textContent = 'Choose an event and enter first name, last name, and phone or email. Instagram is optional.';
    return;
  }
  try {
    const data = await api('/api/rsvps', { method: 'POST', body: { sessionCode, firstName, lastName, contact, instagram, guestCount, teamName, termsAccepted: hasAcceptedTerms() } });
    localStorage.setItem('detectiveFirstName', firstName);
    localStorage.setItem('detectiveLastName', lastName);
    localStorage.setItem('detectiveInstagram', instagram);
    localStorage.setItem('detectiveContact', contact);
    if (data.eventType === 'free' && data.sharedAccessCode) {
      msg.innerHTML = `✅ RSVP saved. Your detective spot is reserved. This is a free shared-code event. Your access code is <b>${escapeHtml(data.sharedAccessCode)}</b>.`;
    } else {
      msg.innerHTML = '✅ RSVP saved. Your detective spot is reserved for this showtime. You cannot reserve another investigation that overlaps this time window. After payment, the host will assign your personal access code.';
    }
  } catch (err) {
    msg.textContent = err.message;
  }
}

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

async function join() {
  $('joinError').textContent = '';
  const accessCode = $('accessCode').value.trim().toUpperCase();
  const firstName = $('firstName').value.trim();
  const lastName = $('lastName').value.trim();
  const instagram = $('instagramHandle').value.trim();
  if (!accessCode || !firstName || !lastName) {
    $('joinError').textContent = 'Enter your personal access code, first name, and last name. Instagram is optional.';
    return;
  }
  try {
    const data = await api('/api/access/join', { method: 'POST', body: { accessCode, firstName, lastName, instagram, playerId, termsAccepted: hasAcceptedTerms() } });
    playerId = data.playerId;
    localStorage.setItem('detectivePlayerId', playerId);
    localStorage.setItem('detectiveFirstName', firstName);
    localStorage.setItem('detectiveLastName', lastName);
    localStorage.setItem('detectiveInstagram', instagram);
    localStorage.setItem('detectiveAccessCode', accessCode);
    state = data.state;
    updateLevelLabels(state);
    activeSessionKey = `detectiveAck:${state.sessionCode}`;
    connectSocket(data.sessionCode || state.sessionCode);
    startPolling(data.sessionCode || state.sessionCode);
    detectNotifications(state, true);
    $('introRoot').classList.add('hidden');
    $('appTopbar').classList.remove('hidden');
    $('appMain').classList.remove('hidden');
    render();
    inspectDialogTriggers(state, true);
    inspectCountdown(state);
  } catch (err) {
    $('joinError').textContent = err.message;
  }
}

function connectSocket(code) {
  if (ws) ws.close();
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`);
  ws.onmessage = evt => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'state') receiveState(msg.state);
  };
  ws.onclose = () => setTimeout(() => state && connectSocket(state.sessionCode), 2500);
}

function startPolling(code) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const next = await api(`/api/sessions/${code}`);
      receiveState(next, true);
    } catch (_err) {}
  }, 4000);
}

function receiveState(next, fromPoll = false) {
  activeSessionKey = `detectiveAck:${next.sessionCode}`;
  detectNotifications(next, fromPoll);
  state = next;
  updateLevelLabels(state);
  render();
  inspectCountdown(next);
  inspectDialogTriggers(next, fromPoll);
}

function detectNotifications(next, silent) {
  if (silent || !state) {
    previousHostMessageCount = next.hostMessages?.length || 0;
    previousCounts = clueCounts(next);
    return;
  }

  const newClues = findNewClues(state, next);
  const newHostMessage = (next.hostMessages?.length || 0) > previousHostMessageCount;

  if (newClues.length) {
    notify('New evidence unlocked');
    enqueueClueDialogs(newClues, next.sessionCode);
  }
  if (newHostMessage) notify('Host message');

  previousCounts = clueCounts(next);
  previousHostMessageCount = next.hostMessages?.length || 0;
}

function allVisibleClues(s) {
  const clues = [];
  for (const c of (s.publicClues || [])) clues.push({ ...c, appKey: 'casefeed', appLabel: 'Case Feed' });
  for (const [appKey, appClues] of Object.entries(s.apps || {})) {
    const label = APP_META[appKey]?.[1] || appKey;
    for (const c of (appClues || [])) clues.push({ ...c, appKey, appLabel: label });
  }
  return clues;
}

function findNewClues(oldState, newState) {
  const oldIds = new Set(allVisibleClues(oldState || {}).map(c => c.id));
  const ack = getAckForSession(newState.sessionCode);
  return allVisibleClues(newState)
    .filter(c => c.id && !oldIds.has(c.id) && !ack.clues.includes(c.id))
    .sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
}

function enqueueClueDialogs(clues, sessionCode) {
  for (const clue of clues) {
    enqueueDialog({
      key: `clue:${clue.id}`,
      meta: 'New Clue Unlocked',
      title: `${clue.appLabel}: ${clue.title || 'Evidence'}`,
      text: clue.text || 'New evidence has unlocked.',
      ackType: 'clue',
      ackValue: clue.id,
      viewLabel: 'View Clue',
      viewAction: () => {
        currentApp = clue.appKey || 'casefeed';
        render();
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      }
    });
  }
  renderDialog();
}

function clueCounts(s) {
  const counts = { casefeed: s.publicClues?.length || 0 };
  for (const key of Object.keys(APP_META)) {
    if (key === 'casefeed') continue;
    counts[key] = key === 'accuse' ? getVisibleQuestionsForState(s).length : (s.apps?.[key]?.length || 0);
  }
  return counts;
}

function notify(text) {
  if (navigator.vibrate) navigator.vibrate(120);
  const oldTitle = document.title;
  document.title = `• ${text}`;
  setTimeout(() => { document.title = oldTitle; }, 1800);
}

function fmt(sec) {
  sec = Math.max(0, Number(sec || 0));
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function phaseLabel(phase) {
  return ({ lobby: 'Lobby', investigation: 'Investigation', accusation: 'Accusation Open', accusation_locked: 'Accusation Locked', revealed: 'Revealed' })[phase] || phase;
}

function show(id, yes) { $(id).classList.toggle('hidden', !yes); }

function render() {
  const joined = Boolean(state);
  $('appTopbar').classList.toggle('hidden', !joined);
  $('appMain').classList.toggle('hidden', !joined);
  $('phasePill').textContent = state ? phaseLabel(state.phase) : 'Lobby';
  $('timerPill').textContent = state ? fmt(state.remainingSec) : '30:00';

  if (!state) return;
  const isLobby = state.phase === 'lobby';
  const isRevealed = state.phase === 'revealed';
  const inGame = !isLobby && !isRevealed;

  show('lobbyCard', isLobby);
  show('progressCard', inGame && Boolean(state.currentRound));
  show('homeCard', inGame && !currentApp);
  show('appDetailCard', inGame && currentApp && currentApp !== 'accuse');
  show('accuseCard', inGame && currentApp === 'accuse');
  show('revealCard', isRevealed);
  show('roundPill', Boolean(state.currentRound));

  $('lobbyCode').textContent = state.sessionCode;
  $('lobbyPlayers').textContent = state.players.length;
  $('roundPill').textContent = state.currentRound ? state.currentRound.shortTitle || state.currentRound.title : '';

  renderProgressBar();
  renderApps();
  renderAppDetail();
  renderAccuse();
  renderReveal();
}

function renderProgressBar() {
  if (!state?.currentRound) return;
  const r = state.currentRound;
  const total = Math.max(1, Number(state.totalSec || 1));
  const pct = Math.max(0, Math.min(100, (Number(state.elapsedSec || 0) / total) * 100));
  $('progressRound').textContent = r.title || 'Current Round';
  $('progressTime').textContent = `${fmt(state.remainingSec)} left`;
  $('progressFill').style.width = `${pct}%`;
  $('progressObjective').textContent = r.objective || 'Review the evidence and connect the clues.';
}

function renderApps() {
  $('appGrid').innerHTML = Object.entries(APP_META).map(([key,[emoji,label]]) => {
    let count = 0;
    if (key === 'casefeed') count = state.publicClues?.length || 0;
    else if (key === 'accuse') count = getVisibleQuestions().length;
    else count = state.apps?.[key]?.length || 0;
    return `<button class="appIcon" onclick="openApp('${key}')"><span class="badge">${count}</span><span class="emoji">${emoji}</span><b>${label}</b><small>${key === 'accuse' ? accusationMini() : `${count} unlocked`}</small></button>`;
  }).join('');
}

window.openApp = key => {
  currentApp = key;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function renderAppDetail() {
  if (!currentApp || currentApp === 'accuse') return;
  const [emoji,label] = APP_META[currentApp];
  $('appTitle').textContent = `${emoji} ${label}`;
  const clues = currentApp === 'casefeed' ? (state.publicClues || []) : (state.apps?.[currentApp] || []);
  $('appEvidence').innerHTML = clues.length ? clues.map(clueHtml).join('') : '<p class="muted">No evidence has unlocked in this app yet.</p>';
}

function clueHtml(c) {
  return `<div class="feedItem"><div class="time">Unlocked at ${fmt(c.unlockSec || 0)}</div><h4>${escapeHtml(c.title || 'Evidence')}</h4><p>${escapeHtml(c.text || '')}</p></div>`;
}

function accusationMini() {
  const visible = getVisibleQuestions().length;
  if (state.phase === 'accusation') return `${visible} questions open`;
  if (state.phase === 'accusation_locked') return 'Locked';
  return `${visible} unlocked · final in ${fmt(state.remainingToAccusationSec)}`;
}

function getVisibleQuestionsForState(s) {
  const questions = s?.accusation?.questions || [];
  const elapsed = Number(s?.elapsedSec || 0);
  const phase = s?.phase || 'lobby';
  return questions.filter(q => phase === 'revealed' || phase === 'accusation' || phase === 'accusation_locked' || elapsed >= Number(q.unlockSec || 0));
}

function getVisibleQuestions() {
  return getVisibleQuestionsForState(state);
}

function questionStageLabel(question) {
  return question.stage === 'final' ? 'Final Accusation' : 'Round Checkpoint';
}

function getMySubmission() {
  return (state?.submissions || []).find(s => s.playerId === playerId) || null;
}

function getMyResult() {
  return (state?.results || []).find(r => r.playerId === playerId) || null;
}

function renderAccuse() {
  const open = state.phase === 'accusation';
  const locked = state.phase === 'accusation_locked';
  const config = state.accusation || { questions: [] };
  const visibleQuestions = getVisibleQuestions();
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const answeredVisible = visibleQuestions.filter(q => saved[q.id]).length;

  if (open) $('accuseStatus').textContent = `Final accusation is open. Complete all ${config.questions.length} mystery questions before submitting.`;
  else if (locked) $('accuseStatus').textContent = 'The accusation window is now closed.';
  else $('accuseStatus').textContent = `${answeredVisible}/${visibleQuestions.length} unlocked questions answered. Final questions open in ${fmt(state.remainingToAccusationSec)}.`;

  show('accuseFormWrap', Boolean(visibleQuestions.length));
  $('submitAccuseBtn').disabled = !open;
  $('submitAccuseBtn').textContent = open ? 'Submit Final 10-Point Mystery' : 'Final Submit Opens Later';

  $('accuseQuestions').innerHTML = visibleQuestions.length ? visibleQuestions.map(question => {
    const selected = saved[question.id] || '';
    return `<div class="questionCard"><div class="time">${escapeHtml(questionStageLabel(question))}</div><h3>${escapeHtml(question.prompt)}</h3><div class="choiceList">${(question.options || []).map(opt => `
      <label class="choiceOption ${selected === opt.id ? 'selected' : ''}">
        <input type="radio" name="accuse-${escapeHtml(question.id)}" data-question-id="${escapeHtml(question.id)}" value="${escapeHtml(opt.id)}" ${selected === opt.id ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        <span>${escapeHtml(opt.label)}</span>
      </label>`).join('')}</div></div>`;
  }).join('') : '<p class="muted">No mystery questions have unlocked yet. Keep investigating.</p>';

  const total = config.questions?.length || 10;
  const answeredTotal = (config.questions || []).filter(q => saved[q.id]).length;
  const submittedText = submission?.finalSubmittedAt
    ? `Final mystery submitted at ${new Date(submission.finalSubmittedAt).toLocaleTimeString()}.`
    : `${answeredTotal}/${total} total mystery questions answered.`;
  $('accuseResult').textContent = submittedText;
  setTimeout(syncChoiceHighlights, 0);
}

function syncChoiceHighlights() {
  document.querySelectorAll('.choiceOption').forEach(label => label.classList.toggle('selected', Boolean(label.querySelector('input:checked'))));
}

async function saveQuestionAnswer(input) {
  if (!state || !input?.dataset?.questionId || !input.value) return;
  const answers = { [input.dataset.questionId]: input.value };
  try {
    const data = await api(`/api/sessions/${state.sessionCode}/answer`, {
      method: 'POST',
      body: { playerId, answers }
    });
    state = data.state;
    const submission = getMySubmission();
    const total = state.accusation?.questions?.length || 10;
    const answeredTotal = (state.accusation?.questions || []).filter(q => submission?.answers?.[q.id]).length;
    $('accuseResult').textContent = `Saved. ${answeredTotal}/${total} total mystery questions answered.`;
  } catch (err) {
    $('accuseResult').textContent = err.message;
  }
}

async function submitAccusation() {
  try {
    const config = state.accusation || { questions: [] };
    const submission = getMySubmission();
    const answers = { ...(submission?.answers || {}) };
    const missing = [];
    for (const question of config.questions || []) {
      const selected = document.querySelector(`input[name="accuse-${question.id}"]:checked`);
      if (selected) answers[question.id] = selected.value;
      if (!answers[question.id]) missing.push(question.prompt || question.id);
    }
    if (missing.length) {
      $('accuseResult').textContent = `Please answer all ${config.questions.length} mystery questions before submitting.`;
      return;
    }
    const data = await api(`/api/sessions/${state.sessionCode}/accuse`, {
      method: 'POST',
      body: { playerId, answers }
    });
    $('accuseResult').textContent = 'Final accusation submitted.';
    state = data.state;
    render();
  } catch (err) {
    $('accuseResult').textContent = err.message;
  }
}

async function requestHelp(text = '') {
  if (!state) return;
  const message = text || prompt('What does your team need help with?', 'We need help reviewing the current evidence.');
  if (!message) return;
  await api(`/api/sessions/${state.sessionCode}/help`, { method: 'POST', body: { playerId, text: message } });
  notify('Help request sent');
}

function renderReveal() {
  if (state.phase !== 'revealed') return;
  const result = getMyResult();
  const answer = state.answerKey || {};
  if (result) {
    $('resultSummary').innerHTML = `
      <div class="resultBanner">
        <div>
          <div class="time">Detective Results</div>
          <h3>${escapeHtml(result.playerName)}</h3>
          <p><b>Score:</b> ${result.score} / ${result.total}</p>
          <p><b>Rating:</b> ${escapeHtml(result.badge)}</p><p><b>Difficulty:</b> ${escapeHtml(state.difficultyLabel || 'ROOKIE DETECTIVE CASE')}</p>
        </div>
      </div>
      <div class="feedItem"><h4>Answer Review</h4>${result.breakdown.map(item => `<p><b>${escapeHtml(item.prompt)}</b><br>Your answer: ${escapeHtml(item.selectedLabel)}${item.correct ? ' ✅' : ` ❌<br>Correct answer: ${escapeHtml(item.correctLabel)}`}</p>`).join('')}</div>`;
    $('shareCardWrap').classList.remove('hidden');
    renderBadgeCanvas(result);
  } else {
    $('resultSummary').innerHTML = '<p class="muted">Your result will appear here after the host reveals the case.</p>';
    $('shareCardWrap').classList.add('hidden');
  }
  $('answerKey').innerHTML = `
    <div class="feedItem"><h4>Culprit</h4><p>${escapeHtml(answer.culprit || '')}</p></div>
    <div class="feedItem"><h4>Method</h4><p>${escapeHtml(answer.method || '')}</p></div>
    <div class="feedItem"><h4>Motive</h4><p>${escapeHtml(answer.motive || '')}</p></div>
    <div class="feedItem"><h4>Key Evidence</h4><p>${escapeHtml(answer.keyEvidence || '')}</p></div>
    <div class="feedItem"><h4>Explanation</h4><p>${escapeHtml(answer.explanation || '')}</p></div>`;
}

function inspectDialogTriggers(next, silent = false) {
  if (!next) return;
  if (!activeSessionKey) activeSessionKey = `detectiveAck:${next.sessionCode}`;

  const ack = getAck();
  const messages = next.hostMessages || [];
  const unseenMessages = messages.filter(m => !ack.messages.includes(m.id));
  if (!silent) {
    unseenMessages.forEach(m => enqueueDialog({
      key: `msg:${m.id}`,
      meta: m.kind === 'opening' ? 'Opening Briefing' : (m.kind === 'reveal' ? 'Case Closed' : 'Host Dialogue'),
      title: m.title || 'Host',
      text: m.text,
      ackType: 'message',
      ackValue: m.id
    }));
  }

  const round = next.currentRound;
  if (round && !ack.rounds.includes(round.id) && next.phase !== 'lobby' && next.phase !== 'revealed') {
    enqueueDialog({
      key: `round:${round.id}`,
      meta: 'Round Briefing',
      title: round.title,
      text: round.dialogue || round.objective || 'Review the newly unlocked evidence.',
      ackType: 'round',
      ackValue: round.id
    });
  }

  const myResult = (next.results || []).find(r => r.playerId === playerId);
  const resultKey = myResult ? `${myResult.playerId}:${myResult.updatedAt}` : '';
  if (myResult && next.phase === 'revealed' && !ack.results.includes(resultKey)) {
    enqueueDialog({
      key: `result:${resultKey}`,
      meta: 'Detective Results',
      title: myResult.badge,
      text: `${myResult.playerName}, you scored ${myResult.score}/${myResult.total}. Your rating is ${myResult.badge}.`,
      ackType: 'result',
      ackValue: resultKey
    });
  }

  renderDialog();
}

function inspectCountdown(next) {
  if (!next || !Array.isArray(next.rounds) || next.phase === 'lobby' || next.phase === 'revealed') {
    show('countdownOverlay', false);
    return;
  }

  const elapsed = Number(next.elapsedSec || 0);
  const currentIndex = next.rounds.findIndex(r => r.id === next.currentRound?.id);
  const upcoming = currentIndex >= 0 ? next.rounds[currentIndex + 1] : null;
  if (!upcoming) {
    show('countdownOverlay', false);
    return;
  }

  const secsUntil = Number(upcoming.startSec || 0) - elapsed;
  if (secsUntil > 0 && secsUntil <= 10) {
    $('countdownMeta').textContent = 'Inter-Round Countdown';
    $('countdownTitle').textContent = `Next: ${upcoming.title}`;
    $('countdownReview').textContent = next.currentRound?.countdownReview || next.currentRound?.objective || 'Review what you know so far and get ready for the next wave of evidence.';
    $('countdownNumber').textContent = secsUntil;
    $('countdownNext').textContent = `${upcoming.dialogue || upcoming.objective || 'A new round is about to begin.'}`;
    show('countdownOverlay', true);
  } else {
    show('countdownOverlay', false);
  }
}

function enqueueDialog(item) {
  if (dialogQueue.some(d => d.key === item.key)) return;
  dialogQueue.push(item);
}

function renderDialog() {
  if (dialogOpen || !dialogQueue.length) return;
  dialogOpen = true;
  const current = dialogQueue[0];
  $('dialogMeta').textContent = current.meta || 'Host Dialogue';
  $('dialogTitle').textContent = current.title || 'Message';
  $('dialogText').textContent = current.text || '';
  activeDialogAction = current.viewAction || null;
  $('dialogViewBtn').textContent = current.viewLabel || 'View';
  $('dialogViewBtn').classList.toggle('hidden', !activeDialogAction);
  show('dialogOverlay', true);
}

function dismissDialog() {
  const current = dialogQueue.shift();
  if (current?.ackType && current?.ackValue) rememberAck(current.ackType, current.ackValue);
  dialogOpen = false;
  activeDialogAction = null;
  show('dialogOverlay', false);
  if (dialogQueue.length) renderDialog();
}

function getAckForSession(sessionCode) {
  const key = `detectiveAck:${sessionCode}`;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return { messages: parsed.messages || [], rounds: parsed.rounds || [], results: parsed.results || [], clues: parsed.clues || [] };
  } catch {
    return { messages: [], rounds: [], results: [], clues: [] };
  }
}

function getAck() {
  return getAckForSession((state && state.sessionCode) || activeSessionKey.replace('detectiveAck:', ''));
}

function rememberAck(type, value) {
  const ack = getAck();
  if (type === 'message' && !ack.messages.includes(value)) ack.messages.push(value);
  if (type === 'round' && !ack.rounds.includes(value)) ack.rounds.push(value);
  if (type === 'result' && !ack.results.includes(value)) ack.results.push(value);
  if (type === 'clue' && !ack.clues.includes(value)) ack.clues.push(value);
  localStorage.setItem(activeSessionKey, JSON.stringify(ack));
}

async function renderBadgeCanvas(result) {
  if (!result) return;
  const renderKey = `${result.playerId}:${result.updatedAt}:${result.badge}:${result.score}`;
  if (renderKey === lastBadgeKey) return;
  lastBadgeKey = renderKey;
  const canvas = $('badgeCanvas');
  const ctx = canvas.getContext('2d');
  const bg = await loadImage('/assets/fear-garden-title-bg.png');
  const logo = await loadImage('/assets/barfly-social-logo.png').catch(() => null);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCoverImage(ctx, bg, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, 'rgba(4,7,16,0.28)');
  grad.addColorStop(0.55, 'rgba(4,7,16,0.56)');
  grad.addColorStop(1, 'rgba(4,7,16,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(37,211,255,0.35)';
  ctx.lineWidth = 8;
  roundedRect(ctx, 44, 44, canvas.width - 88, canvas.height - 88, 34);
  ctx.stroke();

  if (logo) {
    const maxW = 540;
    const ratio = Math.min(maxW / logo.width, 180 / logo.height);
    const w = logo.width * ratio;
    const h = logo.height * ratio;
    ctx.drawImage(logo, (canvas.width - w) / 2, 104, w, h);
  }

  ctx.fillStyle = '#dfe8ff';
  ctx.textAlign = 'center';
  ctx.font = '700 30px Arial';
  ctx.fillText('BARFLY SOCIAL PRESENTS', canvas.width / 2, 340);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 86px Arial';
  ctx.fillText('Fear Garden', canvas.width / 2, 465);
  ctx.font = '600 42px Arial';
  ctx.fillText('A Live Detective Mystery', canvas.width / 2, 530);
  ctx.font = '700 30px Arial';
  ctx.fillStyle = '#ffd7f4';
  ctx.fillText(state?.difficultyLabel || 'ROOKIE DETECTIVE CASE', canvas.width / 2, 590);

  ctx.fillStyle = 'rgba(8,12,25,0.68)';
  roundedRect(ctx, 96, 720, canvas.width - 192, 760, 38);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,57,185,0.35)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#25d3ff';
  ctx.font = '700 28px Arial';
  ctx.fillText('DETECTIVE RESULTS', canvas.width / 2, 815);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 60px Arial';
  wrapCenteredText(ctx, result.playerName, canvas.width / 2, 930, canvas.width - 260, 72);
  ctx.fillStyle = '#ffd166';
  ctx.font = '900 76px Arial';
  wrapCenteredText(ctx, result.badge, canvas.width / 2, 1080, canvas.width - 260, 86);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 46px Arial';
  ctx.fillText(`Score: ${result.score} / ${result.total}`, canvas.width / 2, 1250);
  ctx.font = '600 32px Arial';
  ctx.fillStyle = '#ffd7f4';
  ctx.fillText(state?.difficultyLabel || 'ROOKIE DETECTIVE CASE', canvas.width / 2, 1308);
  ctx.font = '600 34px Arial';
  ctx.fillStyle = '#dbe7ff';
  ctx.fillStyle = '#dbe7ff';
  ctx.fillText('Case Closed at Beer Garden', canvas.width / 2, 1380);

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 26px Arial';
  ctx.fillText('Share your badge and challenge your friends.', canvas.width / 2, 1658);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapCenteredText(ctx, text, centerX, startY, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  let y = startY;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, centerX, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, centerX, y);
}

function drawCoverImage(ctx, img, w, h) {
  const ir = img.width / img.height;
  const tr = w / h;
  let dw, dh, dx, dy;
  if (ir > tr) {
    dh = h;
    dw = h * ir;
    dx = (w - dw) / 2;
    dy = 0;
  } else {
    dw = w;
    dh = w / ir;
    dx = 0;
    dy = (h - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function loadImage(src) {
  if (imageCache[src]) return imageCache[src];
  imageCache[src] = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  return imageCache[src];
}

async function canvasBlob() {
  const canvas = $('badgeCanvas');
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function shareBadge() {
  const result = getMyResult();
  if (!result) return;
  await renderBadgeCanvas(result);
  const blob = await canvasBlob();
  if (!blob) return;
  const safeName = (result.playerName || 'detective').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'detective';
  const file = new File([blob], `fear-garden-${safeName}.png`, { type: 'image/png' });
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: 'Fear Garden', text: `${result.playerName} earned the ${result.badge} badge.`, files: [file] });
    } else {
      await downloadBadge();
    }
  } catch (_err) {}
}

async function downloadBadge() {
  const result = getMyResult();
  if (!result) return;
  await renderBadgeCanvas(result);
  const canvas = $('badgeCanvas');
  const safeName = (result.playerName || 'detective').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'detective';
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `fear-garden-${safeName}.png`;
  link.click();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
