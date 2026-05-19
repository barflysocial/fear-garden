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
  detectiveNotes: ['🗒️','Detective Notes'],
  accuse: ['⚖️','Questions']
};
const BARFLY_APP_URL = 'https://fear-garden.onrender.com/player/';
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
let answerReviewOpen = false;
let caseLogicOpen = false;
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
let detectiveNotes = defaultDetectiveNotes();
let detectiveNotesLoadedFor = '';
let detectiveNotesSaveTimer = null;
let detectiveNotesSaveStatus = '';
let detectiveNotesSaving = false;
let detectiveNotesUiMountedKey = '';
let detectiveNotesRemoteLoaded = false;
let serverClockOffsetMs = 0;
let lobbyCountdownTimer = null;
let lobbyTutorialAcknowledged = false;
let checkpointPopupQuestionId = '';
let checkpointPopupDismissed = {};
let checkpointPopupSelected = '';
let checkpointPopupSelections = {};
let checkpointPopupIsSubmitting = false;
const HOST_ISSUE_MAILTO = 'mailto:INFO@BARFLY.SOCIAL?subject=Fear%20Garden%20Game%20Issue';

const params = new URLSearchParams(location.search);
if (params.get('access')) $('accessCode').value = params.get('access').toUpperCase();
else $('accessCode').value = '';

if ($('rsvpFirstName') && localStorage.getItem('detectiveFirstName')) $('rsvpFirstName').value = localStorage.getItem('detectiveFirstName');
if ($('rsvpInstagram') && localStorage.getItem('detectiveInstagram')) $('rsvpInstagram').value = localStorage.getItem('detectiveInstagram');
if ($('rsvpContact') && localStorage.getItem('detectiveContact')) $('rsvpContact').value = localStorage.getItem('detectiveContact');

$('joinBtn').onclick = async () => {
  const isDemo = await isCurrentAccessDemo();
  requireTermsAcceptance(join, { force: isDemo, persist: !isDemo });
};
$('rsvpBtn').onclick = () => requireTermsAcceptance(() => { setIntroStage('rsvp'); loadRsvpSessions(); });
if ($('myRsvpBtn')) $('myRsvpBtn').onclick = () => setIntroStage('myRsvp');
if ($('myRsvpBackBtn')) $('myRsvpBackBtn').onclick = () => setIntroStage('title');
if ($('findMyRsvpBtn')) $('findMyRsvpBtn').onclick = findMyRsvp;
$('rsvpBackBtn').onclick = () => setIntroStage('title');
if ($('rsvpDateBackBtn')) $('rsvpDateBackBtn').onclick = () => setIntroStage('title');
$('submitRsvpBtn').onclick = () => requireTermsAcceptance(submitRsvp);
$('rsvpChangeSessionBtn').onclick = showRsvpBrowser;
document.addEventListener('click', event => {
  const copyBtn = event.target?.closest?.('[data-copy-code]');
  if (copyBtn) {
    copyRsvpCode(copyBtn.getAttribute('data-copy-code'));
    return;
  }
  const checkInBtn = event.target?.closest?.('[data-rsvp-checkin-code]');
  if (checkInBtn) {
    checkInNowFromRsvp(
      checkInBtn.getAttribute('data-rsvp-checkin-code'),
      checkInBtn.getAttribute('data-rsvp-lookup') || ''
    );
  }
});
['rsvpDateFilter'].forEach(id => { if ($(id)) $(id).addEventListener('change', renderRsvpBrowser); });
$('helpBtn').onclick = () => openHostIssuePopup();
$('accuseHelpBtn').onclick = () => openHostIssuePopup();
if ($('helpLobbyBtn')) $('helpLobbyBtn').onclick = () => openHostIssuePopup();
if ($('lobbyTutorialGotItBtn')) $('lobbyTutorialGotItBtn').onclick = acknowledgeLobbyTutorial;
if ($('lobbyTutorialReviewBtn')) $('lobbyTutorialReviewBtn').onclick = reviewLobbyTutorial;
if ($('hostIssueCloseBtn')) $('hostIssueCloseBtn').onclick = () => closeHostIssuePopup();
if ($('emailHostBtn')) $('emailHostBtn').href = HOST_ISSUE_MAILTO;
if ($('checkpointPopupClose')) $('checkpointPopupClose').onclick = closeCheckpointPopup;
if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').onclick = submitCheckpointPopup;
$('submitAccuseBtn').onclick = submitAccusation;
$('dialogOkBtn').onclick = dismissDialog;
$('dialogViewBtn').onclick = () => { const action = activeDialogAction; dismissDialog(); if (typeof action === 'function') action(); };
if ($('enterInvestigationBtn')) $('enterInvestigationBtn').onclick = () => requireTermsAcceptance(() => setIntroStage('join'));
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
$('accessCode').addEventListener('blur', () => { const code = $('accessCode').value.trim().toUpperCase(); if (code.length >= 5) loadAccessPreview(code); });
$('accessCode').addEventListener('input', () => { const code = $('accessCode').value.trim().toUpperCase(); if (code.length >= 5) loadAccessPreview(code); else updateLevelLabels(null); });
document.addEventListener('click', event => {
  const option = event.target?.closest?.('.choiceOption');
  if (!option) return;
  const input = option.querySelector('input[type="radio"]');
  if (!input || input.disabled) return;

  // Make the entire answer card reliably selectable on phones and desktop.
  // Prevent the label's default click behavior from fighting the manual selection.
  event.preventDefault();
  input.checked = true;

  if (option.classList.contains('checkpointPopupChoice')) {
    checkpointPopupSelected = input.value;
    rememberCheckpointPopupSelection(checkpointPopupQuestionId, input.value);
    syncCheckpointPopupSelection();
    return;
  }

  syncChoiceHighlights();
  saveQuestionAnswer(input).catch(() => {
    if ($('accuseResult')) $('accuseResult').textContent = 'Answer selected, but it could not be saved. Check your connection and try again.';
  });
});
document.addEventListener('change', event => {
  const name = String(event.target?.name || '');
  if (name.startsWith('checkpoint-popup-')) {
    checkpointPopupSelected = event.target.value;
    const qid = name.replace('checkpoint-popup-', '') || checkpointPopupQuestionId;
    rememberCheckpointPopupSelection(qid, event.target.value);
    syncCheckpointPopupSelection();
    return;
  }
  if (name.startsWith('accuse-')) {
    syncChoiceHighlights();
    saveQuestionAnswer(event.target).catch(() => {
      if ($('accuseResult')) $('accuseResult').textContent = 'Answer selected, but it could not be saved. Check your connection and try again.';
    });
  }
});

document.addEventListener('input', event => {
  const field = event.target?.dataset?.noteField;
  if (!field) return;
  detectiveNotes[field] = event.target.value;
  saveDetectiveNotesLocal();
  scheduleDetectiveNotesSave();
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
  toggleScreen('myRsvpScreen', stage === 'myRsvp');
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
  if ($('topbarSubtitle')) $('topbarSubtitle').textContent = `Barfly Social Presents · Mid City Beer Garden${diff ? ` · ${diff}` : ''}`;
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
  const eventType = item.eventType === 'free' ? 'Free Event' : (item.ticketPrice ? `Paid Event · $${item.ticketPrice}` : 'Paid Event');
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
    <p class="mini">${escapeHtml(item.eventType === 'free' ? 'Free Event' : (item.ticketPrice ? `Paid Event · $${item.ticketPrice}` : 'Paid Event'))} · ${escapeHtml(String(item.eventDurationMinutes || 45))}-minute session · ${escapeHtml(String(item.seatsAvailable ?? item.spotsAvailable ?? 0))} seats left out of ${escapeHtml(String(item.playerCap || 25))}</p>`;
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
  if (msg) msg.textContent = '';
  const sessionCode = selectedRsvpSessionCode || $('rsvpSession')?.value || '';
  const firstName = $('rsvpFirstName').value.trim();
  const contactRaw = $('rsvpContact').value.trim();
  const phone = normalizePhoneInput(contactRaw);
  const instagram = $('rsvpInstagram').value.trim();
  if (!sessionCode) { if (msg) msg.textContent = 'Choose a showtime before reserving.'; return; }
  if (!firstName || phone.length !== 10) { if (msg) msg.textContent = 'Enter your first name and a valid 10-digit phone number.'; return; }
  try {
    const data = await api('/api/rsvps', { method: 'POST', body: { sessionCode, firstName, phone, contact: phone, socialMedia: instagram, instagram, termsAccepted: hasAcceptedTerms() } });
    localStorage.setItem('detectiveFirstName', firstName);
    localStorage.setItem('detectiveContact', phone);
    localStorage.setItem('detectiveInstagram', instagram);
    const code = data.rsvp?.accessCode || data.sharedAccessCode || '';
    renderRsvpCodeBox(code, data.eventType, data.ticketPrice, data.paymentPending, phone);
    if (data.paymentPending) {
      msg.innerHTML = `✅ RSVP saved. Your detective spot is reserved.<br><b>${escapeHtml(data.ticketPrice ? `Paid Event · $${data.ticketPrice}` : 'Paid Event')}</b><br>Please see the host to complete payment and receive your check-in code.`;
    } else if (code) {
      msg.innerHTML = `✅ RSVP saved. Your detective spot is reserved.<br><b>${escapeHtml(data.eventType === 'free' ? 'Free Event' : 'Paid Event')}</b>`;
    } else {
      msg.innerHTML = '✅ RSVP saved. Your detective spot is reserved. Please see the host for your check-in code.';
    }
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
}

function normalizePhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.slice(0, 10);
}


function renderRsvpCodeBox(code, eventType = 'paid', ticketPrice = '', paymentPending = false, lookupValue = '') {
  const box = $('rsvpCodeBox');
  if (!box) return;
  box.classList.remove('hidden');
  if (paymentPending) {
    box.innerHTML = `
      <div class="time">RESERVATION SAVED</div>
      <h3>Paid Event${ticketPrice ? ` · $${escapeHtml(ticketPrice)}` : ''}</h3>
      <p class="notice">Your spot is reserved. Please see the host to complete payment and receive your 5-digit check-in code.</p>
    `;
    return;
  }
  if (!code) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `
    <div class="time">${eventType === 'free' ? 'FREE EVENT' : 'YOUR CHECK-IN CODE'}</div>
    <div class="bigRsvpCode">${escapeHtml(code)}</div>
    <div class="row" style="justify-content:center; gap:10px; flex-wrap:wrap;">
      <button class="secondary" type="button" data-copy-code="${escapeHtml(code)}">Copy Code</button>
      <button type="button" data-rsvp-checkin-code="${escapeHtml(code)}" data-rsvp-lookup="${escapeHtml(lookupValue)}">Play Now</button>
    </div>
    <p class="mini">Tap Play Now to use this reservation automatically, or copy your 5-digit code and enter it later from My RSVP.</p>
  `;
}

async function copyRsvpCode(code) {
  const msg = $('rsvpMessage');
  try {
    await navigator.clipboard.writeText(code || '');
    if (msg) msg.textContent = 'Code copied.';
  } catch (_err) {
    if (msg) msg.textContent = 'Copy failed. Press and hold the code to copy it manually.';
  }
}

async function findMyRsvp() {
  const msg = $('myRsvpMessage');
  const result = $('myRsvpResult');
  const lookup = $('myRsvpLookup')?.value?.trim() || '';
  if (msg) msg.textContent = '';
  if (result) { result.classList.add('hidden'); result.innerHTML = ''; }
  if (!lookup) { if (msg) msg.textContent = 'Enter your phone number or check-in code.'; return; }
  try {
    const data = await api('/api/rsvps/lookup', { method: 'POST', body: { lookup } });
    const code = data.accessCode || data.rsvp?.accessCode || '';
    const session = data.session || {};
    const pending = Boolean(data.paymentPending);
    if (result) {
      result.classList.remove('hidden');
      result.innerHTML = `
        <div class="time">RSVP FOUND</div>
        <h3>${escapeHtml(data.rsvp?.displayName || data.rsvp?.firstName || 'Detective')}</h3>
        <p><b>Session:</b> ${escapeHtml(session.tableName || session.truthPackTitle || 'Fear Garden')}</p>
        <p><b>Game Time:</b> ${escapeHtml([session.eventDateLabel, session.eventTimeLabel].filter(Boolean).join(' · ') || 'Time TBD')}</p>
        <p><b>Event:</b> ${escapeHtml(session.eventPriceLabel || (session.eventType === 'free' ? 'Free Event' : 'Paid Event'))}</p>
        <p><b>Status:</b> ${escapeHtml(data.rsvp?.status || 'RSVP’d')}</p>
        ${pending ? '<p class="notice">Payment is pending. Please see the host to complete payment and receive your 5-digit check-in code.</p>' : (code ? `<div class="time">YOUR CHECK-IN CODE</div><div class="bigRsvpCode">${escapeHtml(code)}</div>` : '<p class="notice">No check-in code is available yet. Please see the host.</p>')}
        <div class="row" style="justify-content:center; gap:10px; flex-wrap:wrap;">
          ${(!pending && code) ? `<button class="secondary" type="button" data-copy-code="${escapeHtml(code)}">Copy Code</button><button type="button" data-rsvp-checkin-code="${escapeHtml(code)}" data-rsvp-lookup="${escapeHtml(lookup)}">Play Now</button>` : ''}
        </div>
      `;
    }
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
}

async function checkInNowFromRsvp(code, lookupValue = '') {
  const msg = $('rsvpMessage');
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) {
    if (msg) msg.textContent = 'No check-in code is available yet.';
    return;
  }
  if ($('accessCode')) $('accessCode').value = cleanCode;
  if (msg) msg.textContent = 'Opening your game...';
  await join(cleanCode, msg, lookupValue);
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

async function join(accessCodeOverride = '', messageEl = null, rsvpLookupValue = '') {
  const errorTarget = messageEl || $('joinError');
  if (errorTarget) errorTarget.textContent = '';
  if ($('joinError') && messageEl !== $('joinError')) $('joinError').textContent = '';
  const accessCode = String(accessCodeOverride || $('accessCode').value || '').trim().toUpperCase();
  if (!accessCode) {
    if (errorTarget) errorTarget.textContent = 'Enter your phone number or check-in code.';
    return;
  }
  try {
    const data = await api('/api/access/join', { method: 'POST', body: { accessCode, playerId, rsvpLookup: rsvpLookupValue, termsAccepted: hasAcceptedTerms() } });
    playerId = data.playerId;
    localStorage.setItem('detectivePlayerId', playerId);
    localStorage.setItem('detectiveAccessCode', accessCode);
    if (data.player?.firstName) localStorage.setItem('detectiveFirstName', data.player.firstName);
    if (data.player?.lastName) localStorage.setItem('detectiveLastName', data.player.lastName);
    if (data.player?.instagram) localStorage.setItem('detectiveInstagram', data.player.instagram);
    state = data.state;
    syncServerClock(state);
    updateLevelLabels(state);
    activeSessionKey = `detectiveAck:${state.sessionCode}`;
    detectiveNotes = loadDetectiveNotesLocal();
    detectiveNotesLoadedFor = notesStorageKey();
    loadDetectiveNotesRemote().catch(() => {});
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
    if (errorTarget) errorTarget.textContent = err.message;
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
  syncServerClock(state);
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
  // Show one notification popup for each unlock wave. Do NOT reveal clue title/text here.
  // This prevents back-to-back alert windows if the host jumps the timer during testing.
  const clean = (clues || []).filter(clue => clue?.id);
  if (!clean.length) return;
  const appLabels = Array.from(new Set(clean.map(clue => clue.appLabel || APP_META[clue.appKey]?.[1] || 'Case Feed')));
  const labelText = appLabels.length === 1 ? appLabels[0] : `${appLabels.slice(0, 3).join(', ')}${appLabels.length > 3 ? ' +' + (appLabels.length - 3) : ''}`;
  enqueueDialog({
    key: `clueNotify:${sessionCode}:${clean.map(clue => clue.id).join(',')}`,
    meta: 'New Evidence Unlocked',
    title: appLabels.length === 1 ? `${labelText} Updated` : 'Investigation Apps Updated',
    text: `New evidence has unlocked in ${labelText}. Check your investigation apps when ready.`,
    viewLabel: 'OK',
    viewAction: null,
    ackType: 'clues',
    ackValues: clean.map(clue => clue.id)
  });
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
    ['0:00–0:45','The Night Goes Quiet','Fear Garden was supposed to be a live mystery preview inside Mid City Beer Garden: music, drinks, clues, and a staged crime for guests to solve. Then Lena Broussard collapsed during the event, and the room realized this was not part of the show.','This Training briefing gives the clearest path: focus on Lena, the drink system, and who had access to the service rail.'],
    ['0:45–1:30','The Victim: Lena Broussard','Lena was the event lead helping Barfly Social test the first Fear Garden experience. She knew the staff layout, the clue schedule, and the sponsor money behind the event.','She also knew secrets. Several people needed Lena quiet before the launch became public.'],
    ['1:30–2:15','The First Problem','Lena had a known allergy protocol. Her safe drink should have carried a visible marker and her emergency injector should have been nearby. After she collapsed, the marker was missing and the injector was not where witnesses expected it to be.','Training level starts with the simplest question: who could touch the drink and the marker without looking suspicious?'],
    ['2:15–3:30','People Under Pressure','Tessa Marchand feared losing her lead bartender role. Owen Landry had sponsor money problems. Brielle Hart had online exposure to hide. Cole Vinet controlled sound and effects. Marisol Vega understood staff access better than anyone.','Motive alone is not enough. Match motive to access.'],
    ['3:30–4:15','Evidence Path','Your apps will unlock texts, camera notes, receipt details, staff access logs, photos, and statements. Every clue belongs to a path, but not every path points to the same level solution.','Read the level label carefully. Each difficulty has its own culprit and evidence trail.'],
    ['4:15–5:00','Your Mission','You are the detective team. Follow the clues as they unlock, answer each checkpoint question, and save your final accusation for the end.','When the timer starts, do not chase the loudest suspect. Follow the evidence that survives comparison.']
  ],
  rookie: [
    ['0:00–0:45','A Game Becomes a Case','Fear Garden was designed to blur fiction and nightlife. Guests expected staged evidence, dramatic clues, and a fictional victim. Instead, Lena Broussard became the real emergency.','Rookie level gives you enough guidance to connect the drink, the timeline, and the missing injector.'],
    ['0:45–1:30','Lena Knew Too Much','Lena was reviewing sponsor records and event procedures before the preview. She had noticed missing money, unusual camera gaps, and inconsistencies in the staff movement log.','Someone did not just want Lena embarrassed. Someone needed her stopped before she talked.'],
    ['1:30–2:15','The Drink and the Corridor','The key early question is not only what Lena drank, but where the drink moved before it reached her. A short corridor overlap and a camera export gap create the first serious contradiction.','If the record was edited, the editor matters as much as the person near the glass.'],
    ['2:15–3:30','Suspects With Motives','Tessa had role pressure. Owen had sponsor-money pressure. Brielle had reputation pressure. Cole had control over the sound booth. Marisol had access to staff systems.','At Rookie level, the solution is built from money, access, and a deliberate cover-up.'],
    ['3:30–4:15','What to Compare','Compare the office log, safe access, camera export, fake invoices, and witness timing. A single clue may look weak alone, but together they form a chain.','The right answer should explain both the murder method and the evidence manipulation.'],
    ['4:15–5:00','Your Mission','Answer each checkpoint as the rounds close. Your final accusation will ask who did it, how, why, what proves it, and which statement collapses.','Do not submit based on suspicion. Submit based on the chain.']
  ],
  junior: [
    ['0:00–0:45','The Social Trail','At Junior Detective level, the case expands beyond the drink path. Lena had been reviewing livestream material and private messages tied to a staged charity promotion.','The killer used public noise to hide private movement.'],
    ['0:45–1:30','A Public Alibi','One suspect appears visible online at the exact moment suspicion should be highest. But raw cache files can tell a different story than posted content.','When digital proof looks too clean, ask whether it was performed for an audience.'],
    ['1:30–2:15','The Allergy Trigger','The method depends on switching what Lena was exposed to and making it look like a service mistake. A garnish bottle photo, deleted messages, and livestream timing all matter.','Junior level asks you to compare social evidence with physical evidence.'],
    ['2:15–3:30','The Red Herrings','Tessa’s bar access still matters. Owen still looks financially suspicious. Cole still controls technical systems. Marisol still knows staff credentials.','But one suspect’s online story creates the strongest contradiction when matched to the physical clue.'],
    ['3:30–4:15','What to Prove','Look for the evidence that connects motive, location, and method. The right final answer is not just who had a reason; it is who had the reason and the staged visibility.','A good alibi can be a clue if it was built too carefully.'],
    ['4:15–5:00','Your Mission','Build the timeline twice: once from what people claimed, and once from what the records actually show.','The difference between those timelines is where the killer stands.']
  ],
  detective: [
    ['0:00–0:45','Effects, Timing, and Control','At Detective level, Fear Garden leans into technical control: sound cues, fog effects, booth automation, and a missing rescue item.','The killer used the event environment as a mechanism, not just a backdrop.'],
    ['0:45–1:30','A Cue That Was Not Innocent','During the event, a sound cue and fog effect created confusion at the exact moment Lena needed help. That timing was not random.','A performer could panic the room. A technician could shape the moment.'],
    ['1:30–2:15','The Hidden Preparation','A fog-fluid receipt, booth automation log, and locker photo create a path that is easy to overlook if you only focus on the bar.','Detective level rewards players who leave the obvious drink path and inspect the production system.'],
    ['2:15–3:30','Suspect Pressure','Cole Vinet had access to sound and timing. Owen and Tessa still carry obvious heat. Brielle has digital motive. Marisol understands credentials.','This level asks who could create a controlled window and make a medical emergency look like chaos.'],
    ['3:30–4:15','What to Compare','Compare the sound booth record, purchase trail, and access photo against each suspect’s statement. Small technical facts matter.','If the clue explains timing, preparation, and opportunity, it belongs near the solution.'],
    ['4:15–5:00','Your Mission','Do not solve the level like a simple drink swap. Treat the venue itself as part of the weapon.','The killer did not only act in the room. The killer controlled the room.']
  ],
  senior: [
    ['0:00–0:45','A Frame Inside the Frame','Senior Detective level assumes the killer knows investigators will follow obvious records. Some evidence was not just hidden; it was arranged to blame someone else.','This level is about the frame job as much as the murder.'],
    ['0:45–1:30','Credential Logic','A duplicate staff badge, a staged login, and an emergency kit moved out of place create a deeper pattern than a single suspect’s motive.','Access records can lie when the wrong person has the right credential.'],
    ['1:30–2:15','Money Behind the Curtain','Event deposits, shell vendors, and rerouted payments give one suspect a reason to silence Lena and redirect suspicion toward Owen.','Senior level makes the financial path harder because a false path also exists.'],
    ['2:15–3:30','Noise and Misdirection','Tessa, Owen, Brielle, and Cole each have reasons to look bad. That does not mean their clues are useless. Some are useful because the killer expected you to follow them.','Ask which suspect benefits from another suspect looking guilty.'],
    ['3:30–4:15','What to Prove','The strongest solution must explain the moved emergency kit, the duplicate badge, the shell vendor ledger, and the staged login metadata.','One answer should connect all four without needing coincidence.'],
    ['4:15–5:00','Your Mission','Attack every easy conclusion. If a clue points too directly, ask who had the power to place it there.','Senior Detective cases are solved by finding the person who controlled the evidence after the crime.']
  ],
  master: []
};
STORY_BRIEFINGS.master = STORY_BRIEFINGS.senior;
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
      <div class="beatTime">Case Briefing</div>
      <h3>${escapeHtml(title)}</h3>
      ${paras.map(p => `<p>${escapeHtml(p).replace(/“([^”]+)”/g, '<b>“$1”</b>')}</p>`).join('')}
    </article>`;
  }).join('');
}


function syncServerClock(s = state) {
  if (s && Number(s.serverTime)) {
    serverClockOffsetMs = Number(s.serverTime) - Date.now();
  }
}

function serverNowMs() {
  return Date.now() + (Number(serverClockOffsetMs) || 0);
}

function fmtLobbyCountdown(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) return `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  return `${String(mins).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}

function renderLobbyCountdown() {
  const box = $('lobbyCountdownBox');
  const timer = $('lobbyCountdown');
  const note = $('lobbyCountdownNote');
  const status = $('lobbyStatusText');
  if (!box || !timer || !state || state.phase !== 'lobby') return;

  const scheduled = Number(state.scheduledStartAt || 0);
  if (!scheduled || state.autoStartEnabled === false) {
    box.classList.add('hidden');
    if (status) status.textContent = 'Waiting for host to begin';
    return;
  }

  box.classList.remove('hidden');
  const remaining = scheduled - serverNowMs();
  if (remaining > 0) {
    timer.textContent = fmtLobbyCountdown(remaining);
    if (status) status.textContent = 'Waiting for scheduled start';
    if (note) note.textContent = state.scheduledStartLabel
      ? `Scheduled start: ${state.scheduledStartLabel}`
      : 'Countdown uses the session/server time.';
  } else {
    timer.textContent = '00:00';
    if (status) status.textContent = 'Starting now';
    if (note) note.textContent = 'The investigation is starting. Keep this page open.';
  }
}

function lobbyTutorialKey(s = state) {
  const sessionPart = s?.sessionCode || activeSessionKey || 'session';
  const playerPart = playerId || localStorage.getItem('detectiveAccessCode') || 'player';
  return `ptmLobbyTutorialSeen:${sessionPart}:${playerPart}`;
}

function loadLobbyTutorialState() {
  lobbyTutorialAcknowledged = localStorage.getItem(lobbyTutorialKey()) === '1';
}

function acknowledgeLobbyTutorial() {
  lobbyTutorialAcknowledged = true;
  try { localStorage.setItem(lobbyTutorialKey(), '1'); } catch (err) {}
  renderLobbyTutorial();
}

function reviewLobbyTutorial() {
  lobbyTutorialAcknowledged = false;
  try { localStorage.removeItem(lobbyTutorialKey()); } catch (err) {}
  renderLobbyTutorial();
}

function renderLobbyTutorial() {
  const tutorial = $('lobbyTutorialBox');
  const ready = $('lobbyTutorialReady');
  if (!tutorial || !ready || !state || state.phase !== 'lobby') return;
  tutorial.classList.toggle('hidden', Boolean(lobbyTutorialAcknowledged));
  ready.classList.toggle('hidden', !lobbyTutorialAcknowledged);
}

function ensureLobbyCountdownTimer() {
  if (lobbyCountdownTimer) return;
  lobbyCountdownTimer = setInterval(() => {
    renderLobbyCountdown();
  }, 1000);
}

function phaseLabel(phase) {
  return ({ lobby: 'Lobby', briefing: 'Case Setup', investigation: 'Investigation', accusation: 'Accusation Open', accusation_locked: 'Accusation Locked', revealed: 'Case Closed' })[phase] || phase;
}

function show(id, yes) { $(id).classList.toggle('hidden', !yes); }

function isCheckpointOverlayOpen() {
  const overlay = $('checkpointOverlay');
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

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
  if (!isRevealed) {
    answerReviewOpen = false;
    caseLogicOpen = false;
  }

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
  const me = (state.players || []).find(p => p.id === playerId) || {};
  if ($('lobbyWelcome')) $('lobbyWelcome').textContent = `Welcome${me.firstName ? ', ' + me.firstName : ''}. Waiting for the host to begin the investigation.`;
  if ($('lobbyLevel')) $('lobbyLevel').textContent = state.difficultyLabel || state.difficulty || 'Detective Case';
  if ($('lobbyAccessCode')) $('lobbyAccessCode').textContent = localStorage.getItem('detectiveAccessCode') || me.accessCode || '—';
  $('lobbyPlayers').textContent = (state.rsvp?.checkedIn || state.players.length || 0);
  loadLobbyTutorialState();
  renderLobbyTutorial();
  renderLobbyCountdown();
  $('roundPill').textContent = state.currentRound ? state.currentRound.shortTitle || state.currentRound.title : '';

  renderProgressBar();
  renderApps();
  renderAppDetail();
  renderAccuse();
  renderCheckpointPopup();
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
  if (label) label.textContent = 'Case briefing in progress';
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
  renderCaseBoardStats();
}

function renderCaseBoardStats() {
  if (!state) return;
  const rounds = state.rounds || [];
  const currentIndex = rounds.findIndex(r => r.id === state.currentRound?.id);
  const roundNumber = currentIndex >= 0 ? currentIndex + 1 : Math.min(rounds.length || 5, Math.max(1, Math.ceil(Number(state.elapsedSec || 0) / 300)));
  const totalRounds = rounds.length || 5;
  const visibleClues = allVisibleClues(state);
  const statements = visibleClues.filter(c => String(c.type || '').toLowerCase() === 'statement' || /suspect statement|alibi/i.test(`${c.title || ''} ${c.text || ''}`));
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const checkpointQuestions = (state.accusation?.questions || []).filter(q => q.stage === 'checkpoint');
  const answeredCheckpoints = checkpointQuestions.filter(q => saved[q.id]).length;
  if ($('caseBoardRound')) $('caseBoardRound').textContent = `${roundNumber}/${totalRounds}`;
  if ($('caseBoardEvidence')) $('caseBoardEvidence').textContent = String(visibleClues.length);
  if ($('caseBoardStatements')) $('caseBoardStatements').textContent = String(statements.length);
  if ($('caseBoardCheckpoints')) $('caseBoardCheckpoints').textContent = `${answeredCheckpoints}/${checkpointQuestions.length || 5}`;
}

function isDetectiveNotesOpen() {
  return currentApp === 'detectiveNotes' && $('appDetailCard') && !$('appDetailCard').classList.contains('hidden');
}

function queuedUpdateCount() {
  let count = dialogQueue.length;
  try { if (nextUnansweredCheckpointQuestion()) count += 1; } catch (_err) {}
  return count;
}

function renderApps() {
  $('appGrid').innerHTML = Object.entries(APP_META).map(([key,[emoji,label]]) => {
    let count = 0;
    if (key === 'casefeed') count = state.publicClues?.length || 0;
    else if (key === 'accuse') count = getVisibleQuestions().length;
    else if (key === 'detectiveNotes') count = detectiveNotesWordCount();
    else count = state.apps?.[key]?.length || 0;
    return `<button class="appIcon" onclick="openApp('${key}')"><span class="badge">${count}</span><span class="emoji">${emoji}</span><b>${label}</b><small>${key === 'accuse' ? accusationMini() : (key === 'detectiveNotes' ? `${count} words saved` : `${count} unlocked`)}</small></button>`;
  }).join('');
}

window.openApp = key => {
  const wasInNotes = currentApp === 'detectiveNotes';
  currentApp = key;
  render();
  if (wasInNotes && key !== 'detectiveNotes') {
    renderCheckpointPopup();
    renderDialog();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.closeDetectiveNotes = () => {
  const wasInNotes = currentApp === 'detectiveNotes';
  currentApp = null;
  render();
  if (wasInNotes) {
    renderCheckpointPopup();
    renderDialog();
  }
};

function renderAppDetail() {
  if (!currentApp || currentApp === 'accuse') return;
  if (currentApp === 'detectiveNotes') {
    renderDetectiveNotes();
    return;
  }
  const [emoji,label] = APP_META[currentApp];
  $('appTitle').textContent = `${emoji} ${label}`;
  const clues = currentApp === 'casefeed' ? (state.publicClues || []) : (state.apps?.[currentApp] || []);
  $('appEvidence').innerHTML = clues.length ? clues.map(clueHtml).join('') : '<p class="muted">No evidence has unlocked in this app yet.</p>';
}


function defaultDetectiveNotes() {
  return {
    mainSuspect: '',
    possibleMotive: '',
    importantEvidence: '',
    alibis: '',
    finalTheory: '',
    scratchpad: ''
  };
}

function normalizeDetectiveNotes(notes = {}) {
  const base = defaultDetectiveNotes();
  for (const key of Object.keys(base)) base[key] = String(notes?.[key] || '').slice(0, 5000);
  return base;
}

function notesStorageKey() {
  const session = state?.sessionCode || 'no-session';
  const player = playerId || 'no-player';
  return `detectiveNotes:${session}:${player}`;
}

function loadDetectiveNotesLocal() {
  try {
    const raw = localStorage.getItem(notesStorageKey());
    return normalizeDetectiveNotes(raw ? JSON.parse(raw) : {});
  } catch (_err) {
    return defaultDetectiveNotes();
  }
}

function saveDetectiveNotesLocal() {
  try { localStorage.setItem(notesStorageKey(), JSON.stringify(normalizeDetectiveNotes(detectiveNotes))); } catch (_err) {}
}

async function loadDetectiveNotesRemote() {
  if (!state?.sessionCode || !playerId) return;
  const key = notesStorageKey();
  const data = await api(`/api/sessions/${state.sessionCode}/notes/${encodeURIComponent(playerId)}`);
  if (key !== notesStorageKey()) return;
  const remote = normalizeDetectiveNotes(data.notes || {});
  const local = loadDetectiveNotesLocal();
  detectiveNotes = Object.values(local).some(Boolean) ? { ...remote, ...local } : remote;
  saveDetectiveNotesLocal();
  detectiveNotesLoadedFor = key;
  detectiveNotesRemoteLoaded = true;

  // Do not rebuild the note form while the player is actively typing.
  // Rebuilding the panel during session polling makes the notes appear to close,
  // resets the cursor, and can interrupt autosave on mobile browsers.
  const activeField = document.activeElement?.dataset?.noteField;
  if (currentApp === 'detectiveNotes' && !activeField) renderDetectiveNotes({ force: true });
  else updateDetectiveNotesStatus();
}

function detectiveNotesWordCount() {
  return String(Object.values(detectiveNotes || {}).join(' ')).trim().split(/\s+/).filter(Boolean).length;
}

function scheduleDetectiveNotesSave() {
  detectiveNotesSaveStatus = 'Saving...';
  updateDetectiveNotesStatus();
  clearTimeout(detectiveNotesSaveTimer);
  detectiveNotesSaveTimer = setTimeout(saveDetectiveNotesRemote, 650);
}

function updateDetectiveNotesStatus() {
  const el = $('detectiveNotesStatus');
  if (el) el.textContent = detectiveNotesSaveStatus || 'Autosave ready.';
}

async function saveDetectiveNotesRemote() {
  if (!state?.sessionCode || !playerId || detectiveNotesSaving) return;
  detectiveNotesSaving = true;
  try {
    await api(`/api/sessions/${state.sessionCode}/notes`, { method: 'POST', body: { playerId, notes: normalizeDetectiveNotes(detectiveNotes) } });
    detectiveNotesSaveStatus = `Saved · Last saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch (_err) {
    detectiveNotesSaveStatus = 'Saved on this device · reconnect to sync';
  } finally {
    detectiveNotesSaving = false;
    updateDetectiveNotesStatus();
    renderApps();
  }
}

function noteField(label, key, placeholder, rows = 3) {
  return `<label class="noteField"><span>${escapeHtml(label)}</span><textarea data-note-field="${escapeHtml(key)}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(detectiveNotes[key] || '')}</textarea></label>`;
}

function renderDetectiveNotes(options = {}) {
  const [emoji,label] = APP_META.detectiveNotes;
  $('appTitle').textContent = `${emoji} ${label}`;
  const key = notesStorageKey();
  const activeField = document.activeElement?.dataset?.noteField;

  if (detectiveNotesLoadedFor !== key) {
    detectiveNotes = loadDetectiveNotesLocal();
    detectiveNotesLoadedFor = key;
    detectiveNotesRemoteLoaded = false;
    loadDetectiveNotesRemote().catch(() => {});
  }

  // Keep Detective Notes open during automatic polling/rerenders.
  // If the player is typing, never replace the textarea DOM; just update the status text.
  if (!options.force && activeField && $('appEvidence')?.querySelector('.detectiveNotesPanel')) {
    updateDetectiveNotesStatus();
    return;
  }
  if (!options.force && detectiveNotesUiMountedKey === key && $('appEvidence')?.querySelector('.detectiveNotesPanel')) {
    updateDetectiveNotesStatus();
    return;
  }

  detectiveNotesUiMountedKey = key;
  $('appEvidence').innerHTML = `<div class="detectiveNotesPanel">
    <div class="notesHeaderBox">
      <div>
        <div class="time">Private Detective Scratchpad</div>
        <h3>Track your theory before the final accusation.</h3>
        <p class="mini">These notes are private to this player and do not affect scoring.</p>
      </div>
      <div class="notesAutosave" id="detectiveNotesStatus">${escapeHtml(detectiveNotesSaveStatus || 'Autosave ready.')}</div>
    </div>
    <div class="notesGrid">
      ${noteField('Main Suspect', 'mainSuspect', 'Who do you think did it?')}
      ${noteField('Possible Motive', 'possibleMotive', 'Why would they need Lena stopped?')}
      ${noteField('Important Evidence', 'importantEvidence', 'Which clues actually prove something?')}
      ${noteField('Alibis That Do Not Add Up', 'alibis', 'Which statements feel inconsistent?')}
      ${noteField('Final Theory', 'finalTheory', 'Who, how, why, and what proves it?', 4)}
      ${noteField('Scratchpad', 'scratchpad', 'Jot anything you want to remember during the game.', 6)}
    </div>
    <div class="actions">
      <button class="secondary" type="button" onclick="closeDetectiveNotes()">Close Notes</button>
    </div>
  </div>`;
  updateDetectiveNotesStatus();
}

window.saveDetectiveNotesRemote = saveDetectiveNotesRemote;

function naturalEvidenceDetails(c) {
  const parts = [];
  if (c.weather) parts.push(c.weather);
  if (c.sight) parts.push(c.sight);
  if (c.sound) parts.push(c.sound);
  if (c.smell) parts.push(c.smell);
  if (c.physics) parts.push(c.physics);
  if (c.timelineNote) parts.push(c.timelineNote);
  if (!parts.length) return '';
  return ` ${parts.join(' ')}`;
}

function clueHtml(c) {
  const isStatement = String(c.type || '').toLowerCase() === 'statement' || /suspect statement|alibi/i.test(`${c.title || ''} ${c.text || ''}`);
  const storyTime = c.evidenceTime || c.claimTime || '';
  const naturalText = `${c.text || ''}${naturalEvidenceDetails(c)}`.trim();
  if (isStatement) {
    const rawTitle = c.title || 'Suspect Statement';
    const suspect = rawTitle.replace(/^Suspect Statement:\s*/i, '').trim();
    return `<div class="feedItem suspectCard"><div class="time">Suspect Statement${storyTime ? ' · Story Time: ' + escapeHtml(storyTime) : ''}</div><h4>${escapeHtml(suspect || rawTitle)}</h4><p class="suspectRole">Interview statement / possible motive texture</p><p>${escapeHtml(naturalText)}</p></div>`;
  }
  return `<div class="feedItem"><div class="time">Evidence${storyTime ? ' · Story Time: ' + escapeHtml(storyTime) : ''}</div><h4>${escapeHtml(c.title || 'Evidence')}</h4><p>${escapeHtml(naturalText)}</p></div>`;
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

  if ($('finalDramaBox')) $('finalDramaBox').classList.toggle('hidden', !open);
  if (open) $('accuseStatus').textContent = `Final accusation is open. Complete all ${config.questions.length} mystery questions before submitting.`;
  else if (locked) $('accuseStatus').textContent = 'The accusation window is now closed.';
  else $('accuseStatus').textContent = `${answeredVisible}/${visibleQuestions.length} unlocked questions answered. Final questions open in ${fmt(state.remainingToAccusationSec)}.`;

  show('accuseFormWrap', Boolean(visibleQuestions.length));
  $('submitAccuseBtn').disabled = !open;
  $('submitAccuseBtn').textContent = open ? 'Lock In Final Accusation' : 'Final Submit Opens Later';

  $('accuseQuestions').innerHTML = visibleQuestions.length ? '<div class="miniActionRow"><button class="secondary compact" type="button" onclick="openApp(\'detectiveNotes\')">Open Detective Notes</button></div>' + visibleQuestions.map(question => {
    const selected = saved[question.id] || '';
    return `<div class="questionCard"><div class="time">${escapeHtml(questionStageLabel(question))}</div><h3>${escapeHtml(question.prompt)}</h3>${question.stage === 'checkpoint' && !selected ? `<div class="actions"><button class="secondary compact" type="button" onclick="openCheckpointQuestion('${escapeHtml(question.id)}')">Open Checkpoint Popup</button></div>` : ''}<div class="choiceList">${(question.options || []).map(opt => `
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

function syncCheckpointPopupSelection() {
  const selectedInput = document.querySelector('#checkpointPopupChoices input[type="radio"]:checked');
  checkpointPopupSelected = selectedInput?.value || checkpointPopupSelected || '';
  if (checkpointPopupQuestionId && checkpointPopupSelected) rememberCheckpointPopupSelection(checkpointPopupQuestionId, checkpointPopupSelected);
  document.querySelectorAll('.checkpointPopupChoice').forEach(label => {
    label.classList.toggle('selected', Boolean(label.querySelector('input:checked')));
  });
  if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = !checkpointPopupSelected;
  if (checkpointPopupSelected && $('checkpointPopupStatus')) {
    $('checkpointPopupStatus').textContent = 'Answer selected. Submit when ready.';
  }
}

async function saveQuestionAnswer(input) {
  if (!state || !input?.dataset?.questionId || !input.value) return;
  const answers = { [input.dataset.questionId]: input.value };
  try {
    checkpointPopupIsSubmitting = true;
    if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = true;
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = 'Submitting checkpoint answer...';
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

function openHostIssuePopup() {
  if ($('emailHostBtn')) $('emailHostBtn').href = HOST_ISSUE_MAILTO;
  show('hostIssueOverlay', true);
}

function closeHostIssuePopup() {
  show('hostIssueOverlay', false);
}

async function requestHelp(text = '') {
  openHostIssuePopup();
}


function checkpointPopupKey(questionId) {
  return `${state?.sessionCode || 'session'}:${playerId || 'player'}:${questionId}`;
}

function rememberCheckpointPopupSelection(questionId, value) {
  if (!questionId || !value) return;
  checkpointPopupSelections[checkpointPopupKey(questionId)] = value;
}

function getRememberedCheckpointPopupSelection(questionId) {
  if (!questionId) return '';
  return checkpointPopupSelections[checkpointPopupKey(questionId)] || '';
}

function nextUnansweredCheckpointQuestion() {
  if (!state || !playerId || !['investigation','accusation'].includes(state.phase)) return null;
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const elapsed = Number(state.elapsedSec || 0);
  return (state.accusation?.questions || [])
    .filter(q => q.stage === 'checkpoint' && elapsed >= Number(q.unlockSec || 0) && !saved[q.id])
    .sort((a,b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0))[0] || null;
}

function renderCheckpointPopup(forceQuestion = null) {
  if (!forceQuestion && isDetectiveNotesOpen()) {
    updateDetectiveNotesStatus();
    return;
  }
  const q = forceQuestion || nextUnansweredCheckpointQuestion();
  if (!q) {
    if ($('checkpointOverlay')) show('checkpointOverlay', false);
    checkpointPopupQuestionId = '';
    checkpointPopupSelected = '';
    checkpointPopupIsSubmitting = false;
    return;
  }

  const savedAnswer = getMySubmission()?.answers?.[q.id] || '';
  if (savedAnswer && !forceQuestion) {
    if ($('checkpointOverlay')) show('checkpointOverlay', false);
    checkpointPopupQuestionId = '';
    checkpointPopupSelected = '';
    return;
  }

  const key = checkpointPopupKey(q.id);
  if (!forceQuestion && checkpointPopupDismissed[key]) return;

  const overlayIsOpen = $('checkpointOverlay') && !$('checkpointOverlay').classList.contains('hidden');
  const sameQuestionOpen = overlayIsOpen && checkpointPopupQuestionId === q.id && $('checkpointPopupChoices')?.children?.length;
  const preservedSelection = getRememberedCheckpointPopupSelection(q.id) || (checkpointPopupQuestionId === q.id ? checkpointPopupSelected : '') || '';

  checkpointPopupQuestionId = q.id;
  checkpointPopupSelected = preservedSelection;

  // Do not rebuild the popup while a player is actively answering it. Polling can refresh the
  // session state every few seconds, and a full rebuild would clear the selected answer before
  // the player can press Submit.
  if (sameQuestionOpen && !forceQuestion) {
    const selectedInput = checkpointPopupSelected
      ? document.querySelector(`#checkpointPopupChoices input[value="${CSS.escape(checkpointPopupSelected)}"]`)
      : null;
    if (selectedInput) selectedInput.checked = true;
    syncCheckpointPopupSelection();
    return;
  }

  const checkpointQuestions = (state.accusation?.questions || []).filter(x => x.stage === 'checkpoint');
  const roundNumber = (checkpointQuestions.findIndex(x => x.id === q.id) + 1) || '';
  if ($('checkpointPopupMeta')) $('checkpointPopupMeta').textContent = `Checkpoint ${roundNumber}`;
  if ($('checkpointPopupTitle')) $('checkpointPopupTitle').textContent = 'Round Decision Moment';
  if ($('checkpointPopupPrompt')) $('checkpointPopupPrompt').textContent = q.prompt || 'Submit your checkpoint answer.';
  if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = checkpointPopupSelected
    ? 'Answer selected. Submit when ready.'
    : 'Use only the evidence and suspect statements from this round.';
  if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = !checkpointPopupSelected;
  if ($('checkpointPopupChoices')) $('checkpointPopupChoices').innerHTML = ((q.options || q.choices) || []).map(choice => {
    const checked = checkpointPopupSelected === choice.id;
    return `<label class="choiceOption checkpointPopupChoice ${checked ? 'selected' : ''}" tabindex="0" role="radio" aria-checked="${checked ? 'true' : 'false'}">
      <input type="radio" name="checkpoint-popup-${escapeHtml(q.id)}" value="${escapeHtml(choice.id)}" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(choice.label)}</span>
    </label>`;
  }).join('');
  document.querySelectorAll('.checkpointPopupChoice').forEach(label => {
    label.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const input = label.querySelector('input[type="radio"]');
      if (!input) return;
      input.checked = true;
      checkpointPopupSelected = input.value;
      rememberCheckpointPopupSelection(checkpointPopupQuestionId, input.value);
      syncCheckpointPopupSelection();
    });
  });
  syncCheckpointPopupSelection();
  show('checkpointOverlay', true);
}

function closeCheckpointPopup() {
  if (checkpointPopupQuestionId) checkpointPopupDismissed[checkpointPopupKey(checkpointPopupQuestionId)] = true;
  show('checkpointOverlay', false);
  renderDialog();
}

async function submitCheckpointPopup() {
  if (checkpointPopupIsSubmitting) return;
  const qid = checkpointPopupQuestionId;
  const checkedInput = Array.from(document.querySelectorAll('#checkpointPopupChoices input[type="radio"]')).find(input => input.checked);
  const selected = checkpointPopupSelected || checkedInput?.value || '';
  if (!qid || !selected) {
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = 'Choose an answer before submitting.';
    return;
  }
  try {
    checkpointPopupIsSubmitting = true;
    if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = true;
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = 'Submitting checkpoint answer...';
    const data = await api(`/api/sessions/${state.sessionCode}/answer`, {
      method: 'POST',
      body: { playerId, answers: { [qid]: selected } }
    });
    state = data.state;
    checkpointPopupDismissed[checkpointPopupKey(qid)] = true;
    delete checkpointPopupSelections[checkpointPopupKey(qid)];
    checkpointPopupSelected = '';
    checkpointPopupIsSubmitting = false;
    show('checkpointOverlay', false);
    notify('Checkpoint answer submitted');
    render();
    inspectDialogTriggers(state, false);
    renderDialog();
  } catch (err) {
    checkpointPopupIsSubmitting = false;
    if ($('checkpointPopupSubmit')) $('checkpointPopupSubmit').disabled = !checkpointPopupSelected;
    if ($('checkpointPopupStatus')) $('checkpointPopupStatus').textContent = err.message;
  }
}

window.openCheckpointQuestion = function(questionId) {
  const q = (state?.accusation?.questions || []).find(item => item.id === questionId);
  if (q) renderCheckpointPopup(q);
};

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
          <div class="time">The Reveal</div>
          <h3>Culprit: ${escapeHtml(culprit)}</h3>
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
          <div class="time">The Reveal</div>
          <h3>Culprit: ${escapeHtml(culprit)}</h3>
          ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
          ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
        </div>
      </div>`;
    $('answerReviewPanel').innerHTML = '<div class="feedItem"><h4>Review My Answers</h4><p class="muted">No player result is available on this device.</p></div>';
    $('caseLogicPanel').innerHTML = `<div class="feedItem"><h4>Full Case Logic</h4>${explanation ? `<p>${escapeHtml(explanation)}</p>` : '<p class="muted">Full case logic is not available yet.</p>'}</div>`;
    $('shareCardWrap').classList.add('hidden');
  }
  $('answerReviewPanel')?.classList.toggle('hidden', !answerReviewOpen);
  $('caseLogicPanel')?.classList.toggle('hidden', !caseLogicOpen);
  if ($('reviewAnswersBtn')) $('reviewAnswersBtn').textContent = answerReviewOpen ? 'Hide My Answers' : 'Review My Answers';
  if ($('reviewCaseLogicBtn')) $('reviewCaseLogicBtn').textContent = caseLogicOpen ? 'Hide Full Case Logic' : 'Review Full Case Logic';
  $('answerKey').innerHTML = '';
}

function toggleAnswerReview() {
  const panel = $('answerReviewPanel');
  if (!panel) return;
  answerReviewOpen = !answerReviewOpen;
  panel.classList.toggle('hidden', !answerReviewOpen);
  if ($('reviewAnswersBtn')) $('reviewAnswersBtn').textContent = answerReviewOpen ? 'Hide My Answers' : 'Review My Answers';
}

function toggleCaseLogic() {
  const panel = $('caseLogicPanel');
  if (!panel) return;
  caseLogicOpen = !caseLogicOpen;
  panel.classList.toggle('hidden', !caseLogicOpen);
  if ($('reviewCaseLogicBtn')) $('reviewCaseLogicBtn').textContent = caseLogicOpen ? 'Hide Full Case Logic' : 'Review Full Case Logic';
}


function sponsorTimingLabel(timing) {
  return ({
    waiting_before_briefing: 'Waiting Room / Before Briefing',
    after_round_2_checkpoint: 'After Round 2 Checkpoint',
    after_round_4_checkpoint: 'After Round 4 Checkpoint',
    before_final_accusation: 'Before Final Accusation',
    case_closed: 'Case Closed Screen'
  })[timing] || 'Sponsor Break';
}

function checkpointAnsweredByNumber(next, checkpointNumber) {
  const checkpointQuestions = (next?.accusation?.questions || []).filter(q => q.stage === 'checkpoint');
  const q = checkpointQuestions[checkpointNumber - 1];
  if (!q) return false;
  const submission = (next.submissions || []).find(sub => sub.playerId === playerId);
  return Boolean(submission?.answers?.[q.id]);
}

function sponsorTimingReady(next, timing) {
  if (!next) return false;
  if (timing === 'waiting_before_briefing') return next.phase === 'lobby';
  if (timing === 'after_round_2_checkpoint') return checkpointAnsweredByNumber(next, 2);
  if (timing === 'after_round_4_checkpoint') return checkpointAnsweredByNumber(next, 4);
  if (timing === 'before_final_accusation') return next.phase === 'accusation' || next.phase === 'accusation_locked';
  if (timing === 'case_closed') return next.phase === 'revealed';
  return false;
}

function enqueueSponsorDialogs(next, ack) {
  const ads = (next?.sponsorAds || []).filter(ad => ad && ad.enabled !== false);
  if (!ads.length) return;
  const seen = ack.sponsors || [];
  ads.forEach(ad => {
    const timing = ad.timing || 'waiting_before_briefing';
    const key = `sponsor:${next.sessionCode}:${ad.id}:${timing}`;
    if (seen.includes(key)) return;
    if (!sponsorTimingReady(next, timing)) return;
    enqueueDialog({
      key,
      meta: sponsorTimingLabel(timing),
      title: ad.title || 'Sponsor Message',
      text: ad.message || '',
      ackType: 'sponsor',
      ackValue: key
    });
  });
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

  enqueueExcitementDialogues(next, ack);
  enqueueSponsorDialogs(next, ack);

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

function enqueueExcitementDialogues(next, ack) {
  if (!next || ['lobby','briefing','revealed'].includes(next.phase)) return;
  const elapsed = Number(next.elapsedSec || 0);
  const round = next.currentRound;
  if (round && elapsed >= Number(round.startSec || 0) + 20) {
    const id = `breaking:${next.sessionCode}:${round.id}`;
    if (!ack.messages.includes(id)) {
      const roundNum = (next.rounds || []).findIndex(r => r.id === round.id) + 1;
      enqueueDialog({
        key: id,
        meta: 'BREAKING CASE UPDATE',
        title: roundNum > 1 ? `Round ${roundNum} evidence has shifted the case.` : 'The investigation is officially live.',
        text: round.breakingUpdate || `New information is now active for ${round.title || 'this round'}. Review the latest evidence before the next checkpoint.`,
        ackType: 'message',
        ackValue: id
      });
    }
  }
  const warnAt = Math.floor((Number(next.totalSec || 1800) || 1800) * 0.42);
  const warningId = `redherring:${next.sessionCode}`;
  if (elapsed >= warnAt && !ack.messages.includes(warningId)) {
    enqueueDialog({
      key: warningId,
      meta: 'Careful, Detectives',
      title: 'Not every suspicious detail points to the killer.',
      text: 'Some clues create pressure, not proof. Focus on what connects method, motive, opportunity, and the evidence that survives comparison.',
      ackType: 'message',
      ackValue: warningId
    });
  }
  const lockId = `final-lock:${next.sessionCode}`;
  if (next.phase === 'accusation' && !ack.messages.includes(lockId)) {
    enqueueDialog({
      key: lockId,
      meta: 'Final Accusation Lock-In',
      title: 'The room goes quiet.',
      text: 'The evidence board is nearly complete. Choose carefully: once your final accusation is submitted, it cannot be changed.',
      ackType: 'message',
      ackValue: lockId
    });
  }
}

function inspectCountdown(next) {
  if (isDetectiveNotesOpen()) {
    show('countdownOverlay', false);
    updateDetectiveNotesStatus();
    return;
  }
  if (!next || !Array.isArray(next.rounds) || ['lobby','briefing','revealed'].includes(next.phase)) {
    show('countdownOverlay', false);
    return;
  }

  const elapsed = Number(next.elapsedSec || 0);
  const checkpoint = (next.accusation?.questions || [])
    .filter(q => q.stage === 'checkpoint')
    .map(q => ({ ...q, unlockSec: Number(q.unlockSec || 0) }))
    .filter(q => q.unlockSec > elapsed && q.unlockSec - elapsed <= 30)
    .sort((a,b) => a.unlockSec - b.unlockSec)[0];
  if (checkpoint) {
    const secsUntilCheckpoint = Math.ceil(checkpoint.unlockSec - elapsed);
    $('countdownMeta').textContent = 'Checkpoint Countdown';
    $('countdownTitle').textContent = 'Checkpoint opens soon';
    $('countdownReview').textContent = 'Review the evidence and suspect statements from this round only. The checkpoint will test what this round revealed.';
    $('countdownNumber').textContent = secsUntilCheckpoint;
    $('countdownNext').textContent = checkpoint.prompt || 'Prepare to submit your round answer.';
    show('countdownOverlay', true);
    return;
  }
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
  if (isDetectiveNotesOpen()) {
    updateDetectiveNotesStatus();
    return;
  }
  if (isCheckpointOverlayOpen()) return;
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
    return { messages: parsed.messages || [], rounds: parsed.rounds || [], results: parsed.results || [], clues: parsed.clues || [], sponsors: parsed.sponsors || [] };
  } catch {
    return { messages: [], rounds: [], results: [], clues: [], sponsors: [] };
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
  if (type === 'sponsor' && !ack.sponsors.includes(value)) ack.sponsors.push(value);
  localStorage.setItem(activeSessionKey, JSON.stringify(ack));
}

async function renderBadgeCanvas(result) {
  if (!result) return;
  const renderKey = `cleanBadgeV3:${result.playerId}:${result.updatedAt}:${result.badge}:${result.score}:${state?.difficultyLabel || ''}`;
  if (renderKey === lastBadgeKey) return;
  lastBadgeKey = renderKey;
  const canvas = $('badgeCanvas');
  const ctx = canvas.getContext('2d');
  const bg = await loadImage('/assets/fear-garden-title-bg.png');
  const logo = await loadImage('/assets/barfly-social-logo.png').catch(() => null);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.filter = 'blur(5px)';
  drawCoverImage(ctx, bg, canvas.width, canvas.height);
  ctx.restore();

  const bgShade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgShade.addColorStop(0, 'rgba(3,5,12,0.76)');
  bgShade.addColorStop(0.48, 'rgba(3,5,12,0.62)');
  bgShade.addColorStop(1, 'rgba(3,5,12,0.88)');
  ctx.fillStyle = bgShade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(37,211,255,0.30)';
  ctx.lineWidth = 8;
  roundedRect(ctx, 44, 44, canvas.width - 88, canvas.height - 88, 34);
  ctx.stroke();

  if (logo) {
    const maxW = 210;
    const ratio = Math.min(maxW / logo.width, 86 / logo.height);
    const w = logo.width * ratio;
    const h = logo.height * ratio;
    ctx.globalAlpha = 0.86;
    ctx.drawImage(logo, 74, 76, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#25d3ff';
  ctx.font = '800 34px Arial';
  ctx.fillText('CASE CLOSED', canvas.width / 2, 230);

  const centerX = canvas.width / 2;
  const emblemY = 520;
  const grd = ctx.createRadialGradient(centerX, emblemY, 60, centerX, emblemY, 260);
  grd.addColorStop(0, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.58, 'rgba(255,57,185,0.20)');
  grd.addColorStop(1, 'rgba(37,211,255,0.10)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(centerX, emblemY, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = '#ffd166';
  ctx.font = '900 170px Arial';
  ctx.fillText('★', centerX, 585);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 62px Arial';
  wrapCenteredText(ctx, result.playerName || 'Detective', centerX, 830, canvas.width - 250, 70);

  ctx.fillStyle = '#ffd166';
  ctx.font = '900 74px Arial';
  wrapCenteredText(ctx, result.badge || 'Detective', centerX, 1000, canvas.width - 220, 82);

  ctx.fillStyle = '#f8fbff';
  ctx.font = '800 48px Arial';
  ctx.fillText(`${result.score} / ${result.total} Correct`, centerX, 1190);

  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundedRect(ctx, 116, 1305, canvas.width - 232, 250, 34);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,57,185,0.26)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px Arial';
  ctx.fillText('Fear Garden', centerX, 1398);
  ctx.fillStyle = '#ffd7f4';
  ctx.font = '700 31px Arial';
  ctx.fillText('Mid City Beer Garden', centerX, 1454);
  ctx.fillStyle = '#dbe7ff';
  ctx.font = '700 28px Arial';
  ctx.fillText(state?.difficultyLabel || 'Detective Mystery', centerX, 1506);

  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.font = '700 26px Arial';
  ctx.fillText('Share your badge and challenge your friends.', centerX, 1690);
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

// Build marker: detective-notes-stays-open-training-level-1-002

ensureLobbyCountdownTimer();
