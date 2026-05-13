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
let pendingTermsOptions = { force: false, persist: true };
let termsAcceptedForCurrentAction = false;
let currentAccessPreviewIsDemo = false;
let currentAccessPreviewCode = '';
let lastStoryBriefingKey = '';

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

$('joinBtn').onclick = async () => {
  const isDemo = await isCurrentAccessDemo();
  requireTermsAcceptance(join, { force: isDemo, persist: !isDemo });
};
$('rsvpBtn').onclick = () => requireTermsAcceptance(() => { setIntroStage('rsvp'); loadRsvpSessions(); });
$('rsvpBackBtn').onclick = () => setIntroStage('title');
if ($('rsvpDateBackBtn')) $('rsvpDateBackBtn').onclick = () => setIntroStage('title');
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
if ($('reviewAnswersBtn')) $('reviewAnswersBtn').onclick = toggleAnswerReview;
if ($('reviewCaseLogicBtn')) $('reviewCaseLogicBtn').onclick = toggleCaseLogic;
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
  return termsAcceptedForCurrentAction || localStorage.getItem(TERMS_STORAGE_KEY) === 'yes';
}

async function isCurrentAccessDemo() {
  const code = $('accessCode')?.value?.trim?.().toUpperCase() || '';
  if (!code) return false;
  if (currentAccessPreviewCode === code) return Boolean(currentAccessPreviewIsDemo);
  try {
    const preview = await api(`/api/access/${encodeURIComponent(code)}/preview`);
    currentAccessPreviewCode = code;
    currentAccessPreviewIsDemo = Boolean(preview.demoMode);
    updateLevelLabels(preview);
    return currentAccessPreviewIsDemo;
  } catch (_err) {
    currentAccessPreviewCode = code;
    currentAccessPreviewIsDemo = false;
    return false;
  }
}

function requireTermsAcceptance(nextAction, options = {}) {
  const opts = { force: false, persist: true, ...options };
  if (!opts.force && hasAcceptedTerms()) {
    if (typeof nextAction === 'function') nextAction();
    return;
  }
  pendingTermsAction = nextAction;
  pendingTermsOptions = opts;
  if ($('termsAcceptCheck')) $('termsAcceptCheck').checked = false;
  if ($('termsError')) $('termsError').textContent = '';
  $('termsOverlay').classList.remove('hidden');
}

function acceptTermsAndContinue() {
  if (!$('termsAcceptCheck')?.checked) {
    $('termsError').textContent = 'You must check the acknowledgment box before continuing.';
    return;
  }
  const opts = pendingTermsOptions || { force: false, persist: true };
  if (opts.persist) localStorage.setItem(TERMS_STORAGE_KEY, 'yes');
  termsAcceptedForCurrentAction = true;
  $('termsOverlay')?.classList.add('hidden');
  const next = pendingTermsAction;
  pendingTermsAction = null;
  pendingTermsOptions = { force: false, persist: true };
  if (typeof next === 'function') {
    Promise.resolve(next()).finally(() => { termsAcceptedForCurrentAction = false; });
  } else {
    termsAcceptedForCurrentAction = false;
  }
}

function closeTermsOverlay() {
  $('termsOverlay')?.classList.add('hidden');
  pendingTermsAction = null;
  pendingTermsOptions = { force: false, persist: true };
  termsAcceptedForCurrentAction = false;
}

startIntro();
if (params.get('access')) loadAccessPreview(params.get('access').toUpperCase());

function startIntro() {
  clearTimeout(splashTimer);
  setIntroStage('splash');
  splashTimer = setTimeout(() => setIntroStage('title'), 2400);
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
    const normalizedCode = String(code || '').trim().toUpperCase();
    const preview = await api(`/api/access/${encodeURIComponent(normalizedCode)}/preview`);
    currentAccessPreviewCode = normalizedCode;
    currentAccessPreviewIsDemo = Boolean(preview.demoMode);
    updateLevelLabels(preview);
  } catch (_err) {
    currentAccessPreviewCode = String(code || '').trim().toUpperCase();
    currentAccessPreviewIsDemo = false;
  }
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
  // First state load should establish the baseline only.
  // After that, polling is allowed to trigger clue notifications because
  // timed clue unlocks usually arrive through polling, not only WebSocket pushes.
  if (!state) {
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
  // Host messages can stay quiet during silent polling, but clue unlocks should not.
  if (newHostMessage && !silent) notify('Host message');

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
  // When the five-minute briefing ends, the first wave of clues may already be
  // visible at unlockSec 0. Treat the briefing → investigation transition as a
  // new evidence event so players still get the notification-only popups.
  const briefingJustEnded = oldState?.phase === 'briefing' && newState?.phase !== 'briefing';
  const oldIds = briefingJustEnded ? new Set() : new Set(allVisibleClues(oldState || {}).map(c => c.id));
  const ack = getAckForSession(newState.sessionCode);
  return allVisibleClues(newState)
    .filter(c => c.id && !oldIds.has(c.id) && !ack.clues.includes(c.id))
    .sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
}

function enqueueClueDialogs(clues, sessionCode) {
  // Show a notification popup only. Do NOT reveal clue title/text here.
  // Players must open the designated investigation icon to read the evidence.
  const byApp = new Map();
  for (const clue of clues || []) {
    if (!clue?.id) continue;
    const appKey = clue.appKey || 'casefeed';
    if (!byApp.has(appKey)) {
      byApp.set(appKey, { appKey, appLabel: clue.appLabel || APP_META[appKey]?.[1] || 'Case Feed', ids: [] });
    }
    byApp.get(appKey).ids.push(clue.id);
  }

  for (const group of byApp.values()) {
    enqueueDialog({
      key: `clueNotify:${sessionCode}:${group.appKey}:${group.ids.join(',')}`,
      meta: 'New Evidence Unlocked',
      title: `${group.appLabel} Updated`,
      text: `New evidence has unlocked in ${group.appLabel}. Check your investigation apps when ready.`,
      viewLabel: 'OK',
      viewAction: null,
      ackType: 'clues',
      ackValues: group.ids
    });
  }
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


const STORY_BRIEFINGS = {
  training: [
    ['0:00–0:45','The Garden Goes Quiet','Mid City Beer Garden was built for noise: glasses touching wood tables, patio lights glowing, and the easy sound of a Baton Rouge night. Tonight, that noise stopped when Everett Vale was found near the rear courtyard service gate.','This Training briefing gives you the clearest foundation: a real murder interrupted a fake mystery preview, and the first thing to understand is who had access to the garden path.'],
    ['0:45–1:30','The Victim: Everett Vale','Everett was a nightlife consultant and promoter who knew owners, bartenders, vendors, influencers, and investors. He made people feel important in public, then used secrets as leverage in private.','Several people at the event had a reason to fear what Everett might reveal. In this level, focus on motive, opportunity, and who lied about their location.'],
    ['1:30–2:15','The Murder Window','Everett entered the patio around 9:18 PM. The back walkway camera went dark for seven minutes. When the feed returned, Everett was already down. His phone, a broken glass, and a napkin message were found nearby.','The message read: “THE GARDEN KEEPS WHAT IT HEARS.” Start by treating the blackout as the center of the case.'],
    ['2:15–3:30','The First Three Suspects','Mara Lane organized the event and believed Everett cut her out of the future deal. Dante Reed worked the garden bar, but his employee code was used for a suspicious comped drink. Selene Price, a local influencer, feared Everett had files that could damage her brand.','Each has a clear pressure point. Your job is to decide whose pressure point also matches the evidence.'],
    ['3:30–4:15','The Remaining Suspects','Grant Bell had money tied to Everett’s business plan. Lila Moreau supplied antique props and may have been connected to an old secret. Noah Voss, Everett’s assistant, knew Everett’s files and schedule better than anyone.','Do not pick based on motive alone. Match the timeline to the person with access.'],
    ['4:15–5:00','Your Mission','At 9:36 PM, a message was sent from Everett’s phone: “IF I GO DOWN, THEY ALL GO DOWN.” The timing suggests Everett may already have been dead.','Open each investigation app as evidence unlocks. Compare the phone, messages, receipts, maps, and statements. The garden remembers everything.']
  ],
  rookie: [
    ['0:00–0:45','The Garden Goes Quiet','The Fear Garden preview was supposed to turn Mid City Beer Garden into a playable mystery. Guests arrived expecting staged clues, hidden motives, and a fictional victim. Then Everett Vale became the real body.','The scene near the service gate was close enough to the event setup that some guests laughed at first. Then someone screamed.'],
    ['0:45–1:30','Everett Vale: The Man With Leverage','Everett sold himself as a community-minded nightlife builder, but he collected debts, screenshots, contracts, and secrets. He could make a venue look popular, bury a rival event, or threaten someone’s reputation with one message.','Tonight, he brought several people together who needed him useful, quiet, or gone.'],
    ['1:30–2:15','Seven Missing Minutes','The back walkway camera failed for exactly seven minutes after Everett entered the garden patio. When it returned, Everett was on the ground with his phone nearby and a broken glass beside him.','The napkin under his hand carried the phrase: “THE GARDEN KEEPS WHAT IT HEARS.” Was it a warning, a signature, or part of the original game turned into cover?'],
    ['2:15–3:30','Suspects With Obvious Pressure','Mara Lane lost credit and money when Everett changed the event contract. Dante Reed’s employee code appears in the drink record even though he denies using it. Selene Price was seen deleting messages after the body was found.','At Rookie level, most clues will help you separate a loud motive from a provable action.'],
    ['3:30–4:15','Suspects With Hidden Pressure','Grant Bell wanted ownership and may have caught Everett shopping the deal elsewhere. Lila Moreau’s antique props connect to a note in Everett’s file. Noah Voss says he was printing clues, but the printer record does not support his story.','The killer may not be the person with the biggest argument. Look for the person whose timeline needs the most help.'],
    ['4:15–5:00','Your Mission','A message left Everett’s phone at 9:36 PM: “IF I GO DOWN, THEY ALL GO DOWN.” If Everett was already dead, someone used the phone to shape the story.','During the investigation, watch for contradictions in time, access, and technology. Fear Garden has begun, but the game is no longer pretend.']
  ],
  junior: [
    ['0:00–0:45','A Preview Night Turns Real','Fear Garden was designed as a live mystery preview inside Mid City Beer Garden. The RSVP list was curated, the props were placed, and the first clue drop was scheduled. Everett Vale expected applause. Instead, he became evidence.','The timing matters: the fake game was about to begin when the real crime interrupted it.'],
    ['0:45–1:30','Everett’s Business Web','Everett tied together promotion, sponsorship, vendor access, influencer reach, and investor money. He promised different people different futures, then kept private records that could ruin them if they pushed back.','Junior Detective briefing adds more emphasis on the business web: follow who benefits if Everett cannot talk.'],
    ['1:30–2:15','The Blackout and the Staged Clue','The camera blackout lasted seven minutes. The service path, garden bar, event table, and rear gate all matter because each gave a different kind of access. The napkin message may have been written before the murder, after the murder, or planted to mimic the game’s tone.','Do not assume the strangest item is the most truthful item.'],
    ['2:15–3:30','Mara, Dante, and Selene','Mara had event knowledge and a contract dispute. Dante had bar access and a suspicious employee-code trail. Selene had reputation risk and a digital cleanup problem after the body was found.','Each suspect controls a different lane: event logistics, drink records, and social messages.'],
    ['3:30–4:15','Grant, Lila, and Noah','Grant had money exposed. Lila had a past Everett may have uncovered through the Circa connection. Noah had the closest access to Everett’s private information and the best ability to know when Everett would be alone.','A clean alibi is only clean if the records agree with it.'],
    ['4:15–5:00','Your Mission','The phone message at 9:36 PM says, “IF I GO DOWN, THEY ALL GO DOWN.” The medical timing creates a problem: the message may be post-mortem.','Compare app evidence in order. A wrong time, a reused code, or a missing print job can matter more than a dramatic threat.']
  ],
  detective: [
    ['0:00–0:45','The Garden as a Stage','Mid City Beer Garden gave Fear Garden the perfect setting: movement, noise, dim corners, shared tables, and enough event materials to make almost anything look intentional. Everett Vale understood that. So did the killer.','The murder did not just happen during the game. It used the game’s language as camouflage.'],
    ['0:45–1:30','Everett Vale: Curator of Secrets','Everett’s power came from collecting leverage across Baton Rouge nightlife. He kept copies of contracts, vendor conflicts, sponsorship promises, private messages, and personal scandals. People smiled at him because they had to.','Detective level adds contradiction: several suspects feared exposure, but only one used the event structure well enough to hide murder inside performance.'],
    ['1:30–2:15','Evidence That Performs','The broken glass, blackout, napkin phrase, and delayed phone message could each be evidence or theater. A clue can point toward the killer, or toward the story the killer wanted detectives to tell themselves.','Treat every dramatic object as a question: who could place it, who benefits from it, and who would expect you to overvalue it?'],
    ['2:15–3:30','Three Public Cracks','Mara’s anger was visible. Dante’s history was known to staff. Selene’s fear of exposure was tied to her public identity. These are easy motives because people saw them.','Easy motives can be real, but they can also be useful cover for someone quieter.'],
    ['3:30–4:15','Three Quieter Fault Lines','Grant’s money, Lila’s old accusation, and Noah’s access to Everett’s private systems create deeper lanes. The question is not who disliked Everett. The question is who could control timing, records, and discovery.','At Detective level, watch for the suspect whose story depends on multiple small coincidences.'],
    ['4:15–5:00','Your Mission','The 9:36 PM phone message may be the hinge. If Everett did not send it, the sender needed the phone, knowledge of his threat style, and confidence the message would redirect suspicion.','When evidence unlocks, compare records across apps. The truth is not in one icon. It is in the pattern between them.']
  ],
  senior: [
    ['0:00–0:45','A Murder Hidden in Plain Sight','Fear Garden was never supposed to be quiet. It was designed to blur fiction and reality for paying guests. The killer understood the danger of that blur: people hesitate when they are unsure whether a scene is real.','By the time the scream cut through the patio, the first precious minutes were already gone.'],
    ['0:45–1:30','Everett’s Leverage Economy','Everett Vale did not merely keep secrets; he organized them. Contracts, screenshots, vendor debts, sponsor promises, and private betrayals became a personal economy. Tonight, multiple people believed Everett held the one piece of information that could destroy them.','Senior Detective level adds more misdirection: motive is abundant, but operational control is rare.'],
    ['1:30–2:15','The Scene That Wants to Be Read Wrong','The napkin message is theatrical. The blackout is precise. The phone message is timed to create panic. Each one may be truthful in content but manipulative in purpose.','A smart killer does not need to erase every trace. A smart killer leaves traces that point in useful directions.'],
    ['2:15–3:30','Visible Suspects, Useful Noise','Mara’s contract dispute, Dante’s comped drink trail, and Selene’s deleted messages produce loud investigative noise. Any of them could be guilty, but each also gives the killer something valuable: distraction.','Senior level asks you to distinguish guilt from usefulness to the killer’s cover story.'],
    ['3:30–4:15','Hidden Relationships and Access','Grant’s investment pressure, Lila’s Circa connection, and Noah’s administrative access each create a different type of opportunity. Money pressures behavior. Old secrets create desperation. Access creates timing.','Look for the suspect whose access explains not only the murder, but the evidence after the murder.'],
    ['4:15–5:00','Your Mission','The 9:36 PM message — “IF I GO DOWN, THEY ALL GO DOWN” — may be the killer’s boldest move. It makes everyone look threatened while hiding the person who needed Everett silent immediately.','Read across apps. Eliminate suspects whose motives do not match the logistics. Fear Garden rewards patience.']
  ],
  master: [
    ['0:00–0:45','The Garden Remembers Everything','The patio was loud enough to hide a last breath and crowded enough to make every witness unreliable. Fear Garden promised fiction. The killer delivered reality dressed in the same costume.','At Master level, assume the crime scene was edited for you before you ever arrived.'],
    ['0:45–1:30','Everett Vale: The Man Everyone Needed Until They Did Not','Everett’s talent was making people complicit. He kept them close with opportunity and obedient with fear. He knew whose money was exposed, whose brand was fragile, whose past was buried, and whose future depended on his silence.','No suspect enters clean. Your challenge is not finding a motive; it is finding the motive that required immediate action during the blackout.'],
    ['1:30–2:15','A Scene Built From False Certainty','The blackout is exact. The message is too useful. The napkin sounds like branding. The broken glass draws the eye. Every obvious element may still be real, but none should be trusted alone.','Master level gives you the least comfort. The evidence will not announce its meaning. It will contradict someone quietly.'],
    ['2:15–3:30','The Loud Motives','Mara’s lost credit, Dante’s damaged reputation, and Selene’s threatened brand are emotional, public, and easy to understand. That makes them dangerous — not because they prove guilt, but because they can satisfy you too early.','Do not stop at the first motive that feels human.'],
    ['3:30–4:15','The Quiet Mechanisms','Grant had financial exposure. Lila had a buried connection. Noah had proximity to Everett’s systems, movements, and private language. Each could explain part of the crime. Only one explains the whole chain.','Follow mechanism: who could isolate Everett, manipulate records, and shape the reveal?'],
    ['4:15–5:00','Your Mission','The final message from Everett’s phone may be confession, threat, warning, or forgery. If it is forgery, the killer needed access and nerve. If it is real, the killer needed urgency.','Open the apps as evidence unlocks. Build a timeline, then attack your own assumptions. The garden keeps what it hears, but it does not explain itself.']
  ]
};

function storyBriefingKey(s = state) {
  const raw = String(s?.levelId || s?.difficulty || s?.difficultyLabel || '').toLowerCase();
  if (raw.includes('training')) return 'training';
  if (raw.includes('junior')) return 'junior';
  if (raw.includes('senior')) return 'senior';
  if (raw.includes('master')) return 'master';
  if (raw.includes('detective') && !raw.includes('junior') && !raw.includes('senior')) return 'detective';
  if (raw.includes('rookie')) return 'rookie';
  return 'rookie';
}

function renderStoryBriefingContent() {
  const wrap = $('storyBackstory');
  if (!wrap || !state) return;
  const key = storyBriefingKey(state);
  const renderKey = `${state.sessionCode || ''}:${key}`;
  if (lastStoryBriefingKey === renderKey) return;
  lastStoryBriefingKey = renderKey;
  const beats = STORY_BRIEFINGS[key] || STORY_BRIEFINGS.rookie;
  const ranges = [[0,45],[45,90],[90,135],[135,210],[210,255],[255,300]];
  wrap.innerHTML = beats.map((beat, index) => {
    const [label, title, ...paras] = beat;
    const [start, end] = ranges[index] || [index * 45, (index + 1) * 45];
    return `<article class="storyBeat" data-start="${start}" data-end="${end}">
      <div class="beatTime">${escapeHtml(label)}</div>
      <h3>${escapeHtml(title)}</h3>
      ${paras.map(p => `<p>${escapeHtml(p).replace(/“([^”]+)”/g, '<b>“$1”</b>')}</p>`).join('')}
    </article>`;
  }).join('');
}

function phaseLabel(phase) {
  return ({ lobby: 'Lobby', briefing: 'Case Setup', investigation: 'Investigation', accusation: 'Accusation Open', accusation_locked: 'Accusation Locked', revealed: 'Revealed' })[phase] || phase;
}

function show(id, yes) { $(id).classList.toggle('hidden', !yes); }

function render() {
  const joined = Boolean(state);
  $('appTopbar').classList.toggle('hidden', !joined);
  $('appMain').classList.toggle('hidden', !joined);
  $('phasePill').textContent = state ? phaseLabel(state.phase) : 'Lobby';
  $('timerPill').textContent = state ? fmt(state.phase === 'briefing' ? state.briefingRemainingSec : state.remainingSec) : '30:00';

  if (!state) return;
  const isLobby = state.phase === 'lobby';
  const isBriefing = state.phase === 'briefing';
  const isRevealed = state.phase === 'revealed';
  const inGame = !isLobby && !isBriefing && !isRevealed;

  show('lobbyCard', isLobby);
  show('briefingCard', isBriefing);
  if (isBriefing) {
    $('storyCountdown').textContent = fmt(state.briefingRemainingSec);
    renderStoryBriefingContent();
    updateStoryBriefing();
    renderStoryTimerBar();
  }
  show('progressCard', inGame && Boolean(state.currentRound));
  show('homeCard', inGame && !currentApp);
  show('appDetailCard', inGame && currentApp && currentApp !== 'accuse');
  show('accuseCard', inGame && currentApp === 'accuse');
  show('revealCard', isRevealed);
  show('roundPill', inGame && Boolean(state.currentRound));

  $('lobbyCode').textContent = state.sessionCode;
  $('lobbyPlayers').textContent = state.players.length;
  $('roundPill').textContent = state.currentRound ? state.currentRound.shortTitle || state.currentRound.title : '';

  renderProgressBar();
  renderApps();
  renderAppDetail();
  renderAccuse();
  renderReveal();
}


function updateStoryBriefing() {
  if (!state || state.phase !== 'briefing') return;
  const total = Number(state.briefingTotalSec || 300);
  const remaining = Number(state.briefingRemainingSec || total);
  const elapsed = Math.max(0, total - remaining);
  document.querySelectorAll('.storyBeat').forEach((beat) => {
    const start = Number(beat.dataset.start || 0);
    const end = Number(beat.dataset.end || start + 45);
    const active = elapsed >= start && elapsed < end;
    beat.classList.toggle('activeStoryBeat', active);
    if (active && !beat.dataset.seenActive) {
      beat.dataset.seenActive = '1';
      beat.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function renderStoryTimerBar() {
  if (!state || state.phase !== 'briefing') return;
  const fill = document.getElementById('storyTimerFill');
  const label = document.getElementById('storyTimerLabel');
  if (!fill) return;
  const total = Math.max(1, Number(state.briefingTotalSec || 300));
  const remaining = Math.max(0, Number(state.briefingRemainingSec || 0));
  const elapsed = Math.max(0, total - remaining);
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  fill.style.width = `${pct}%`;
  if (label) label.textContent = `Case briefing in progress · ${fmt(remaining)}`;
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
  const culprit = answer.culprit || answer.killer || 'Unknown';
  const method = answer.method || answer.weapon || '';
  const motive = answer.motive || '';
  const keyEvidence = answer.keyEvidence || '';
  const explanation = answer.explanation || '';

  if (result) {
    $('resultSummary').innerHTML = `
      <div class="resultBanner caseRevealBanner">
        <div>
          <div class="time">Case Revealed</div>
          <h3>${escapeHtml(culprit)}</h3>
          ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
          ${method ? `<p><b>Method:</b> ${escapeHtml(method)}</p>` : ''}
          ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
          <p class="mini"><b>Your Rating:</b> ${escapeHtml(result.badge)} · <b>Score:</b> ${result.score} / ${result.total} · <b>Difficulty:</b> ${escapeHtml(state.difficultyLabel || 'ROOKIE DETECTIVE CASE')}</p>
        </div>
      </div>`;
    $('answerReviewPanel').innerHTML = `<div class="feedItem"><h4>Review My Answers</h4>${result.breakdown.map(item => `<p><b>${escapeHtml(item.prompt)}</b><br>Your answer: ${escapeHtml(item.selectedLabel)}${item.correct ? ' ✅' : ` ❌<br>Correct answer: ${escapeHtml(item.correctLabel)}`}</p>`).join('')}</div>`;
    $('caseLogicPanel').innerHTML = `
      <div class="feedItem"><h4>Full Case Logic</h4>
        ${culprit ? `<p><b>Killer:</b> ${escapeHtml(culprit)}</p>` : ''}
        ${method ? `<p><b>Method:</b> ${escapeHtml(method)}</p>` : ''}
        ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
        ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
        ${explanation ? `<p><b>Explanation:</b> ${escapeHtml(explanation)}</p>` : ''}
      </div>`;
    $('shareCardWrap').classList.remove('hidden');
    renderBadgeCanvas(result);
  } else {
    $('resultSummary').innerHTML = `
      <div class="resultBanner caseRevealBanner">
        <div>
          <div class="time">Case Revealed</div>
          <h3>${escapeHtml(culprit)}</h3>
          ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
          ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
        </div>
      </div>`;
    $('answerReviewPanel').innerHTML = '<div class="feedItem"><h4>Review My Answers</h4><p class="muted">No player result is available on this device.</p></div>';
    $('caseLogicPanel').innerHTML = `<div class="feedItem"><h4>Full Case Logic</h4>${explanation ? `<p>${escapeHtml(explanation)}</p>` : '<p class="muted">Full case logic is not available yet.</p>'}</div>`;
    $('shareCardWrap').classList.add('hidden');
  }
  $('answerReviewPanel')?.classList.add('hidden');
  $('caseLogicPanel')?.classList.add('hidden');
  if ($('reviewAnswersBtn')) $('reviewAnswersBtn').textContent = 'Review My Answers';
  if ($('reviewCaseLogicBtn')) $('reviewCaseLogicBtn').textContent = 'Review Full Case Logic';
  $('answerKey').innerHTML = '';
}

function toggleAnswerReview() {
  const panel = $('answerReviewPanel');
  if (!panel) return;
  const showPanel = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !showPanel);
  if ($('reviewAnswersBtn')) $('reviewAnswersBtn').textContent = showPanel ? 'Hide My Answers' : 'Review My Answers';
}

function toggleCaseLogic() {
  const panel = $('caseLogicPanel');
  if (!panel) return;
  const showPanel = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !showPanel);
  if ($('reviewCaseLogicBtn')) $('reviewCaseLogicBtn').textContent = showPanel ? 'Hide Full Case Logic' : 'Review Full Case Logic';
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
  if (round && !ack.rounds.includes(round.id) && !['lobby','briefing','revealed'].includes(next.phase)) {
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
  if (!next || !Array.isArray(next.rounds) || ['lobby','briefing','revealed'].includes(next.phase)) {
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
  if (current?.ackType === 'clues' && Array.isArray(current.ackValues)) {
    current.ackValues.forEach(id => rememberAck('clue', id));
  } else if (current?.ackType && current?.ackValue) {
    rememberAck(current.ackType, current.ackValue);
  }
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
