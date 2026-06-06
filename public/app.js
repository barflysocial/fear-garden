const app = document.getElementById('app');
const toast = document.getElementById('toast');

const pathName = location.pathname.toLowerCase();
const routeMode = pathName.startsWith('/host') ? 'host' : pathName.startsWith('/play') ? 'player' : 'portal';
const savedView = localStorage.getItem('is_view') || 'home';
const initialView = (routeMode === 'host' && savedView === 'host') || (routeMode === 'player' && savedView === 'player') ? savedView : 'home';

const state = {
  view: initialView,
  code: localStorage.getItem('is_code') || '',
  hostKey: localStorage.getItem('is_hostKey') || '',
  playerId: localStorage.getItem('is_playerId') || '',
  data: null,
  selectedChoice: null,
  selectedFinal: null,
  openInfoPanel: null,
  poll: null
};

let episodeOptions = [
  { id:'island', title:'Island Survivor', subtitle:'Episode 1', tagline:'Survive the island. Survive each other.', venueDefault:'Barfly Social Island Survivor' },
  { id:'zombie', title:'Zombie Safehouse', subtitle:'Episode 2', tagline:'The dead are outside. The danger may already be inside.', venueDefault:'Barfly Social Zombie Safehouse' },
  { id:'murder', title:'Murder Mansion', subtitle:'Episode 3', tagline:'Everyone has a secret. One secret is murder.', venueDefault:'Barfly Social Murder Mansion' },
  { id:'space', title:'Space Colony', subtitle:'Episode 4', tagline:'In space, survival is math. Trust is the variable.', venueDefault:'Barfly Social Space Colony' },
  { id:'bunker', title:'The Bunker', subtitle:'Episode 5', tagline:'The door is sealed. The truth is buried deeper.', venueDefault:'Barfly Social The Bunker' },
  { id:'heist', title:'Bank Heist Gone Wrong', subtitle:'Episode 6', tagline:'The score was easy. Escaping each other is the hard part.', venueDefault:'Barfly Social Bank Heist' }
];

const phaseLabels = {
  lobby: 'Lobby', role_reveal: 'Role Reveal', public_event: 'Public Event', private_scenario: 'Private Scenario',
  public_discussion: 'Public Discussion', private_alliance: 'Private Alliance', choice_lock: 'Choice Lock', round_results: 'Results',
  final_intro: 'Final Encounter', final_choice: 'Final Choice', ending: 'Ending'
};

function html(strings, ...values) { return strings.map((s, i) => s + (values[i] ?? '')).join(''); }
function esc(x) { return String(x ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function showToast(msg) { toast.textContent = msg; toast.hidden = false; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.hidden = true, 3500); }
async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'Request failed.');
  return data;
}
async function loadEpisodes() {
  try { const data = await api('/api/episodes'); if (Array.isArray(data.episodes)) episodeOptions = data.episodes; }
  catch { /* fallback already set */ }
}
function saveSession(kind, code, extra = {}) {
  localStorage.setItem('is_view', kind); localStorage.setItem('is_code', code || '');
  if (extra.hostKey) localStorage.setItem('is_hostKey', extra.hostKey);
  if (extra.playerId) localStorage.setItem('is_playerId', extra.playerId);
  state.view = kind; state.code = code || ''; if (extra.hostKey) state.hostKey = extra.hostKey; if (extra.playerId) state.playerId = extra.playerId;
}
function clearSession() {
  ['is_view','is_code','is_hostKey','is_playerId'].forEach(k => localStorage.removeItem(k));
  state.view = 'home'; state.code = ''; state.hostKey = ''; state.playerId = ''; state.data = null; state.openInfoPanel = null;
  stopPolling(); renderHome();
}
window.clearSession = clearSession;
function startPolling() { stopPolling(); if (!state.code || state.view === 'home') return; fetchState(); state.poll = setInterval(fetchState, 1200); }
function stopPolling() { if (state.poll) clearInterval(state.poll); state.poll = null; }
async function fetchState() {
  try {
    if (!state.code) return;
    let url = `/api/sessions/${encodeURIComponent(state.code)}/state`;
    if (state.view === 'host') url += `?hostKey=${encodeURIComponent(state.hostKey)}`;
    else if (state.view === 'player') url += `?playerId=${encodeURIComponent(state.playerId)}`;
    state.data = await api(url);
    render();
  } catch (err) { showToast(err.message); }
}
function ep() { return state.data?.episode || {}; }

function joinUrl(code) { return `${location.origin}/play?code=${encodeURIComponent(code || '')}`; }
function qrImageUrl(code) { return `/api/sessions/${encodeURIComponent(code || '')}/qr.svg`; }
function formatSchedule(session) {
  if (!session?.scheduledDate && !session?.scheduledTime) return 'Start time not scheduled';
  const date = session.scheduledDate || '';
  const time = session.scheduledTime || '';
  try {
    if (date && time) {
      const d = new Date(`${date}T${time}`);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString([], { weekday:'short', month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
    }
  } catch {}
  return `${date}${date && time ? ' at ' : ''}${time}`.trim();
}
function renderJoinQrPanel(d, compact = false) {
  const s = d.session || d;
  const link = joinUrl(s.code);
  return html`<div class="panel share-panel">
    <div class="header"><div><div class="kicker">Join QR</div><h2>${compact ? 'Share Game' : 'Player Join'}</h2></div><span class="session-code">${esc(s.code)}</span></div>
    <p class="muted">Players scan this QR code or use the join link to enter on the Player screen.</p>
    <div class="qr-wrap"><img class="qr-img" src="${esc(qrImageUrl(s.code))}" alt="QR code for ${esc(s.code)}" /></div>
    <div class="join-link">${esc(link)}</div>
    <div class="host-controls"><button class="btn" data-copy-join="${esc(s.code)}">Copy Join Link</button><button class="btn" data-share-join="${esc(s.code)}">Share</button></div>
  </div>`;
}
function bindShareButtons() {
  document.querySelectorAll('[data-copy-join]').forEach(btn => btn.addEventListener('click', async () => {
    const link = joinUrl(btn.dataset.copyJoin);
    try { await navigator.clipboard.writeText(link); showToast('Join link copied.'); } catch { showToast(link); }
  }));
  document.querySelectorAll('[data-share-join]').forEach(btn => btn.addEventListener('click', async () => {
    const link = joinUrl(btn.dataset.shareJoin);
    if (navigator.share) {
      try { await navigator.share({ title: 'Join Barfly Choice Engine', text: 'Join this game session.', url: link }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(link); showToast('Share link copied.'); } catch { showToast(link); }
  }));
  document.querySelectorAll('[data-copy-host-key]').forEach(btn => btn.addEventListener('click', async () => {
    const key = btn.dataset.copyHostKey || '';
    try { await navigator.clipboard.writeText(key); showToast('Host recovery key copied.'); } catch { showToast(key); }
  }));
  document.querySelectorAll('[data-return-home]').forEach(btn => btn.addEventListener('click', clearSession));
}

const introImages = {
  island: 'titlecards/island.png',
  zombie: 'titlecards/zombie.png',
  murder: 'titlecards/murder.png',
  space: 'titlecards/space.png',
  bunker: 'titlecards/bunker.png',
  heist: 'titlecards/heist.png'
};
function introStorageKey(code, role) { return `is_intro_seen_${role}_${code}`; }
function hasSeenIntro(code, role) { return localStorage.getItem(introStorageKey(code, role)) === '1'; }
function markIntroSeen(code, role) { localStorage.setItem(introStorageKey(code, role), '1'); }
function clearIntroSeen(code) { ['host', 'player'].forEach(role => localStorage.removeItem(introStorageKey(code, role))); }
function shouldShowEpisodeIntro(d) {
  return !!d?.session?.code && d.session.phase === 'lobby' && !hasSeenIntro(d.session.code, state.view);
}
function renderEpisodeIntro(d) {
  const e = d.episode || {};
  const s = d.session || {};
  const img = introImages[e.id] || '';
  const roleLabel = state.view === 'host' ? 'Host Session Created' : 'You Joined the Episode';
  const helperText = state.view === 'host'
    ? 'Share the code, then tap to open your host lobby.'
    : 'Tap to open the lobby and wait for the host to begin.';
  app.innerHTML = html`<section class="episode-intro" style="--episode-image:url('${esc(img)}')">
      <div class="episode-intro__shade"></div>
      <div class="episode-intro__content">
        <div class="kicker">${esc(e.subtitle || 'Episode')} · ${esc(roleLabel)}</div>
        <div class="episode-intro__card">
          <div class="episode-intro__meta">
            <span class="status-pill">Code ${esc(s.code || '')}</span>
            <span class="status-pill">${esc(s.maxPlayers || 0)} Players Max</span>
          </div>
          <h1>${esc(e.title || 'Barfly Choice Engine')}</h1>
          <p class="episode-intro__tagline">${esc(e.tagline || '')}</p>
          <p class="episode-intro__helper">${esc(helperText)}</p>
          <button class="btn primary episode-intro__button" id="tapToBeginBtn">Tap to Begin</button>
        </div>
      </div>
    </section>`;
  document.getElementById('tapToBeginBtn')?.addEventListener('click', () => {
    markIntroSeen(s.code, state.view);
    render();
  });
}
function render() { if (state.view === 'host' && state.data) return renderHost(); if (state.view === 'player' && state.data) return renderPlayer(); renderHome(); }

function renderHome() {
  stopPolling();
  if (routeMode === 'host') return renderHostHome();
  if (routeMode === 'player') return renderPlayerHome();
  return renderPortalHome();
}

function episodeCards() {
  return episodeOptions.map(e => html`<div class="choice-card"><div class="type">${esc(e.subtitle || 'Episode')}</div><h3>${esc(e.title)}</h3><p>${esc(e.tagline)}</p></div>`).join('');
}
function episodeSelectOptions() {
  return episodeOptions.map(e => `<option value="${esc(e.id)}" data-venue="${esc(e.venueDefault || e.title)}">${esc(e.subtitle ? e.subtitle + ' · ' : '')}${esc(e.title)}</option>`).join('');
}

function renderHowToPlayInstructions(context = 'all') {
  const playerPanel = html`<div class="panel soft instruction-panel">
    <div class="kicker">How to Play</div>
    <h2>Player Instructions</h2>
    <ol class="instruction-list">
      <li><strong>Join on the Player Screen.</strong> Open <span class="session-code">/play</span>, enter the game code from the host, and choose a survivor alias.</li>
      <li><strong>Tap to Begin.</strong> After joining, each episode opens with its own cinematic title card. Tap to enter the lobby.</li>
      <li><strong>Wait for the host.</strong> The host starts the game, assigns roles, and moves everyone through each phase.</li>
      <li><strong>Use your role.</strong> Each role gives you a useful advantage, but no one can win alone.</li>
      <li><strong>Read your private scenario.</strong> Your secret card may give you a clue, weakness, resource, or betrayal opportunity.</li>
      <li><strong>Talk publicly.</strong> Use the public chat to plan with the whole group.</li>
      <li><strong>Make private alliances.</strong> During the alliance phase, message one player or an alliance group to make deals, share clues, lie, or betray.</li>
      <li><strong>Lock one action per round.</strong> Choose Help the Group, Help Yourself, or Take a Risk before the timer/host moves on.</li>
      <li><strong>Watch your stats.</strong> Health, hunger, hydration, energy, will, trust, and episode-specific group meters affect survival.</li>
      <li><strong>Prepare for the final encounter.</strong> Too few survivors, low trust, and missing clues make the ending much harder.</li>
    </ol>
  </div>`;
  const hostPanel = html`<div class="panel soft instruction-panel">
    <div class="kicker">Host Instructions</div>
    <h2>How to Run the Game</h2>
    <ol class="instruction-list">
      <li><strong>Open the Host Screen.</strong> Use <span class="session-code">/host</span> to create and control the game.</li>
      <li><strong>Choose an episode.</strong> Pick Island Survivor, Zombie Safehouse, Murder Mansion, Space Colony, The Bunker, or Bank Heist Gone Wrong.</li>
      <li><strong>Create the session.</strong> Set the venue/session name, scheduled date/time, max players, and mode, then click Create Episode.</li>
      <li><strong>Share the player link.</strong> Use the QR code, Share button, or Copy Join Link. Players should join from <span class="session-code">/play</span>, not the host screen.</li>
      <li><strong>Start when ready.</strong> Click Assign Roles + Start Game after players join. The game assigns roles and begins Round 1.</li>
      <li><strong>Advance the phases.</strong> Move players through Public Event, Private Scenario, Public Discussion, Private Alliance, Choice Lock, and Results.</li>
      <li><strong>Monitor the dashboard.</strong> The host sees all player stats, choices, private cards, public/private messages, group stats, hidden threat pressure, and round results.</li>
      <li><strong>Resolve each round.</strong> When players lock choices, click Resolve Round. The engine updates stats, clues, trust, supplies, pressure, and injuries.</li>
      <li><strong>Reveal results.</strong> Players see the public result. The host also sees the hidden truth behind betrayals, clues, and threat changes.</li>
      <li><strong>Run the final encounter.</strong> After Round 6, start the final encounter, let players lock final choices, then reveal the ending and awards.</li>
      <li><strong>Reset only when finished.</strong> Reset Session clears players and progress for that session.</li>
    </ol>
  </div>`;
  if (context === 'host') return hostPanel + playerPanel;
  if (context === 'player') return playerPanel;
  return html`<div class="grid two instructions-grid">${playerPanel}${hostPanel}</div>`;
}
function renderPortalHome() {
  app.innerHTML = html`
    <section class="hero">
      <div class="title-card portal-card">
        <div class="kicker">Barfly Social Prototype</div>
        <h1>Barfly Choice Engine</h1>
        <p class="tagline">Choose your side of the experience.</p>
        ${renderHowToPlayInstructions('all')}
        <div class="grid two">
          <a class="portal-link host-link" href="/host">
            <div class="type">Host Screen</div>
            <h2>Run a Game</h2>
            <p>Create sessions, choose episodes, manage players, advance rounds, and control the final reveal.</p>
            <span class="btn primary">Open Host</span>
          </a>
          <a class="portal-link player-link" href="/play">
            <div class="type">Player Screen</div>
            <h2>Join a Game</h2>
            <p>Enter a game code, choose an alias, view your private cards, message allies, and lock choices.</p>
            <span class="btn primary">Open Player</span>
          </a>
        </div>
        <div class="divider"></div>
        <h2>Selectable Episodes</h2>
        <div class="grid three">${episodeCards()}</div>
      </div>
    </section>`;
}
function renderHostHome() {
  const options = episodeSelectOptions();
  app.innerHTML = html`
    <section class="hero">
      <div class="title-card">
        <div class="kicker">Host Control</div>
        <h1>Games</h1>
        <div class="panel soft">
          <h2>Create Game</h2>
          <form class="form" id="createForm">
            <label>Episode
              <select name="episodeId" id="episodeSelect">${options}</select>
            </label>
            <label>Venue / Session Name
              <input name="venueName" id="venueName" value="${esc(episodeOptions[0]?.venueDefault || 'Barfly Social Game')}" maxlength="60" />
            </label>
            <div class="grid two">
              <label>Event Date
                <input type="date" name="scheduledDate" />
              </label>
              <label>Event Start Time
                <input type="time" name="scheduledTime" />
              </label>
            </div>
            <label>Max Players
              <select name="maxPlayers"><option value="6">6 players</option><option value="5">5 players</option><option value="4">4 players</option><option value="3">3 players</option><option value="2">2 players</option></select>
            </label>
            <label>Mode
              <select name="mode"><option value="standard">Standard · 55 minutes</option><option value="quick">Quick · 35 minutes</option><option value="long">Long · 75 minutes</option></select>
            </label>
            <button class="btn primary" type="submit">Create Game</button>
          </form>
          <div class="divider"></div>
          <h3>Resume Game</h3>
          <button class="btn" id="resumeBtn" type="button">Resume Saved Game</button>
          <form class="form" id="hostResumeForm">
            <label>Game Code<input name="code" placeholder="ISAB12" maxlength="8" /></label>
            <label>Host Recovery Key<input name="hostKey" placeholder="Paste host recovery key" /></label>
            <button class="btn" type="submit">Resume by Key</button>
          </form>
        </div>
      </div>
    </section>`;
  document.getElementById('episodeSelect').addEventListener('change', e => {
    const selected = episodeOptions.find(x => x.id === e.target.value);
    const input = document.getElementById('venueName');
    if (selected && input) input.value = selected.venueDefault || selected.title;
  });
  document.getElementById('createForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try { const data = await api('/api/sessions', { method: 'POST', body: Object.fromEntries(fd.entries()) }); clearIntroSeen(data.session.code); saveSession('host', data.session.code, { hostKey: data.hostKey }); startPolling(); }
    catch (err) { showToast(err.message); }
  });
  document.getElementById('resumeBtn').addEventListener('click', () => {
    const view = localStorage.getItem('is_view');
    if (view !== 'host') return showToast('No saved host session found.');
    state.view = 'host'; state.code = localStorage.getItem('is_code') || ''; state.hostKey = localStorage.getItem('is_hostKey') || '';
    startPolling();
  });
  document.getElementById('hostResumeForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get('code') || '').trim().toUpperCase();
    const hostKey = String(fd.get('hostKey') || '').trim();
    if (!code || !hostKey) return showToast('Game code and host recovery key are required.');
    saveSession('host', code, { hostKey });
    startPolling();
  });
}
function renderPlayerHome() {
  app.innerHTML = html`
    <section class="player-entry-screen">
      <div class="player-title-graphic">
        <img src="/barfly-escape-title.png" alt="Barfly Social Escape Experiences. Every choice changes the ending." />
      </div>
      <div class="player-entry-panel">
        <div class="kicker">Join Your Host's Game</div>
        <h1>Join Game</h1>
        <p class="tagline">Enter the game code selected by your host.</p>
        <form class="form" id="joinForm">
          <label>Game Code<input name="code" placeholder="AB1234" maxlength="8" autocomplete="off" autocapitalize="characters" /></label>
          <label>Your Alias / Nickname<input name="alias" placeholder="Captain Ray" maxlength="24" autocomplete="nickname" /></label>
          <button class="btn primary full" type="submit">Join Game</button>
        </form>
        <div class="player-entry-actions">
          <button class="btn" id="howToPlayBtn" type="button">How to Play</button>
          <button class="btn" id="resumeBtn" type="button">Resume Player Session</button>
        </div>
      </div>
      <div class="info-modal" id="howToPlayModal" aria-hidden="true">
        <button class="info-modal__backdrop" type="button" data-close-how-to-play aria-label="Close How to Play"></button>
        <section class="info-modal__sheet" role="dialog" aria-modal="true" aria-labelledby="howToPlayTitle">
          <div class="header">
            <h2 id="howToPlayTitle">How to Play</h2>
            <button class="btn small" type="button" data-close-how-to-play>Close</button>
          </div>
          <div class="info-modal__body">${renderHowToPlayInstructions('player')}</div>
        </section>
      </div>
    </section>`;
  const urlCodeValue = new URLSearchParams(location.search).get('code');
  if (urlCodeValue) {
    const input = document.querySelector('input[name="code"]');
    if (input) input.value = urlCodeValue.toUpperCase();
  }
  const howToPlayModal = document.getElementById('howToPlayModal');
  document.getElementById('howToPlayBtn')?.addEventListener('click', () => {
    howToPlayModal?.classList.add('is-open');
    howToPlayModal?.setAttribute('aria-hidden', 'false');
  });
  document.querySelectorAll('[data-close-how-to-play]').forEach(btn => btn.addEventListener('click', () => {
    howToPlayModal?.classList.remove('is-open');
    howToPlayModal?.setAttribute('aria-hidden', 'true');
  }));
  document.getElementById('joinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get('code') || '').trim().toUpperCase();
    const alias = String(fd.get('alias') || '').trim();
    try { const data = await api(`/api/sessions/${encodeURIComponent(code)}/join`, { method:'POST', body:{ alias } }); clearIntroSeen(code); saveSession('player', code, { playerId: data.playerId }); startPolling(); }
    catch (err) { showToast(err.message); }
  });
  document.getElementById('resumeBtn').addEventListener('click', () => {
    const view = localStorage.getItem('is_view');
    if (view !== 'player') return showToast('No saved player session found.');
    state.view = 'player'; state.code = localStorage.getItem('is_code') || ''; state.playerId = localStorage.getItem('is_playerId') || '';
    startPolling();
  });
}

function renderHost() {
  const d = state.data, s = d.session, round = d.round, e = d.episode;
  if (shouldShowEpisodeIntro(d)) return renderEpisodeIntro(d);
  app.innerHTML = html`
    <section class="grid host">
      <div class="grid">
        <div class="panel">
          <div class="header">
            <div><div class="kicker">Host Dashboard · ${esc(e.subtitle || '')}</div><h2>${esc(e.title)}</h2><p class="muted">${esc(s.venueName)} · Game Code <span class="session-code">${esc(s.code)}</span></p><p class="muted"><strong>Scheduled:</strong> ${esc(formatSchedule(s))}</p></div>
            <span class="status-pill phase-pill">${esc(phaseLabels[s.phase] || s.phase)}</span>
          </div>
          <p class="tagline">${esc(e.tagline)}</p>
          <div class="host-controls"><button class="btn primary" id="advanceBtn">${hostAdvanceLabel(d)}</button><button class="btn" id="copyBtn">Copy Join Link</button><button class="btn danger" id="resetBtn">Reset Session</button><button class="btn" id="homeBtn">Leave Dashboard</button></div>
          <div class="divider"></div>
          ${renderJoinQrPanel(d)}
          <div class="panel soft host-key-panel">
            <div class="kicker">Host Recovery</div>
            <h3>Host Recovery Key</h3>
            <p class="muted small">Save this key privately. It lets you reopen the host dashboard from another device.</p>
            <div class="join-link">${esc(state.hostKey)}</div>
            <button class="btn" data-copy-host-key="${esc(state.hostKey)}">Copy Host Recovery Key</button>
          </div>
          ${round ? html`<div class="divider"></div><h3>Round ${round.number}: ${esc(round.title)}</h3><p>${esc(round.publicEvent)}</p><p><strong>Goal:</strong> ${esc(round.groupGoal)}</p>` : ''}
        </div>
        ${renderHostPlayers(d)}${renderHostMessages(d)}${renderHostResults(d)}
      </div>
      <aside class="grid">${renderGroupStats(d.groupStats, true)}${renderHostChoices(d)}${renderFinalPanel(d)}</aside>
    </section>`;
  document.getElementById('advanceBtn')?.addEventListener('click', async () => { try { await api(`/api/sessions/${s.code}/host/advance`, { method:'POST', body:{ hostKey: state.hostKey } }); await fetchState(); } catch (err) { showToast(err.message); } });
  document.getElementById('resetBtn')?.addEventListener('click', async () => { if (!confirm(`Reset this ${e.title} session? This clears all players and progress.`)) return; try { const data = await api(`/api/sessions/${s.code}/host/reset`, { method:'POST', body:{ hostKey: state.hostKey } }); clearIntroSeen(data.session.code); saveSession('host', data.session.code, { hostKey: data.hostKey }); await fetchState(); } catch (err) { showToast(err.message); } });
  document.getElementById('copyBtn')?.addEventListener('click', async () => { const link = `${location.origin}/play?code=${s.code}`; try { await navigator.clipboard.writeText(link); showToast('Join link copied.'); } catch { showToast(link); } });
  document.getElementById('homeBtn')?.addEventListener('click', clearSession);
  bindShareButtons();
  document.querySelectorAll('[data-remove-player]').forEach(btn => btn.addEventListener('click', async () => { try { await api(`/api/sessions/${s.code}/host/remove`, { method:'POST', body:{ hostKey: state.hostKey, playerId: btn.dataset.removePlayer } }); await fetchState(); } catch (err) { showToast(err.message); } }));
}
function hostAdvanceLabel(d) { const s = d.session; if (s.status === 'lobby') return 'Assign Roles + Start Game'; if (s.phase === 'choice_lock') return 'Resolve Round'; if (s.phase === 'round_results' && s.currentRound >= 6) return 'Start Final Encounter'; if (s.phase === 'final_choice') return 'Resolve Final Ending'; if (s.status === 'ended') return 'Game Ended'; return 'Advance Phase'; }
function renderHostPlayers(d) { return html`<div class="panel"><div class="header"><h2>${esc(d.episode.playerNoun || 'Players')}</h2><span class="status-pill">${d.players.length}/${d.session.maxPlayers}</span></div><div class="players">${d.players.map(p => html`<div class="player-row"><div><strong>${esc(p.alias)}</strong><small>${esc(roleName(p.role))} · ${esc(p.status)}</small></div><button class="btn danger small" data-remove-player="${p.id}">Remove</button></div><div class="stat-list small">${statCells(p.stats)}</div>`).join('') || '<p class="muted">Waiting for players to join.</p>'}</div></div>`; }
function renderHostChoices(d) { const s = d.session; if (s.status === 'lobby') return `<div class="panel"><h2>Choice Monitor</h2><p class="muted">Choices appear after the game starts.</p></div>`; return html`<div class="panel"><h2>Choice Monitor</h2><table class="table"><thead><tr><th>Player</th><th>Round</th><th>Final</th></tr></thead><tbody>${d.players.map(p => html`<tr><td>${esc(p.alias)}</td><td>${esc(p.choices?.[s.currentRound]?.choiceLabel || 'Not locked')}</td><td>${esc(finalChoiceLabel(p.finalChoice))}</td></tr>`).join('')}</tbody></table></div>`; }
function renderHostMessages(d) { return html`<div class="grid two"><div class="panel"><h2>${esc(d.episode.chatTitle || 'Public Chat')}</h2><div class="chatbox">${renderMessages(d.publicChat || [])}</div></div><div class="panel"><h2>Private Alliance Messages</h2><div class="chatbox">${renderPrivateMessages(d.privateMessages || [])}</div></div></div>`; }
function renderHostResults(d) { const latest = d.latestResult; if (!latest) return `<div class="panel"><h2>Round Results</h2><p class="muted">Results appear after the first resolution.</p></div>`; return html`<div class="panel"><h2>Latest Round Result</h2><div class="grid two"><div><h3>Public</h3><div class="log">${esc(latest.publicSummary)}</div></div><div><h3>Host Truth</h3><div class="log">${esc(latest.hostSummary)}</div></div></div></div>`; }
function renderFinalPanel(d) { if (!d.final) return `<div class="panel"><h2>Final Encounter</h2><p class="muted">${esc(d.episode.finalThreat)} appears after Round 6.</p></div>`; return html`<div class="panel warning"><h2>${esc(d.final.outcome)}</h2><p>${esc(d.final.endingText)}</p><div class="log">Final Score: ${esc(d.final.score)}\n${esc(JSON.stringify(d.final.hostBreakdown || {}, null, 2))}</div></div>`; }

function renderPlayer() {
  const d = state.data, s = d.session, player = d.player, round = d.round, e = d.episode;
  if (shouldShowEpisodeIntro(d)) return renderEpisodeIntro(d);
  const lobbyShare = s.phase === 'lobby' ? renderJoinQrPanel(d, true) : '';
  app.innerHTML = html`
    <section class="player-game-shell">
      <div class="grid">
        <div class="panel">
          <div class="header">
            <div>
              <div class="kicker">${esc(player.alias)} · ${esc(e.title)}</div>
              <h2>${s.currentRound ? `Round ${s.currentRound}${round ? ': ' + esc(round.title) : ''}` : 'Lobby'}</h2>
              <p class="muted">Code <span class="session-code">${esc(s.code)}</span></p>
              <p class="muted"><strong>Scheduled:</strong> ${esc(formatSchedule(s))}</p>
            </div>
            <span class="status-pill phase-pill">${esc(phaseLabels[s.phase] || s.phase)}</span>
          </div>
          ${player.role ? html`<div class="role-card"><h3>You are the ${esc(player.role.name)}</h3><p><strong>${esc(player.role.ability)}:</strong> ${esc(player.role.description)}</p></div>` : `<p class="muted">Waiting for the host to assign roles.</p>`}
          <div class="player-info-buttons" role="group" aria-label="Game information">
            <button class="btn" type="button" data-info-panel="status">Status</button>
            <button class="btn" type="button" data-info-panel="group">Group Status</button>
            <button class="btn" type="button" data-info-panel="players">Players</button>
          </div>
        </div>
        ${lobbyShare}
        ${renderPlayerPhase(d)}
        ${renderPlayerChat(d)}
      </div>
      ${renderPlayerInfoModal(d)}
    </section>`;
  bindPlayerEvents(d);
  bindShareButtons();
  bindPlayerInfoModal();
}

function renderPlayerInfoModal(d) {
  const open = state.openInfoPanel;
  const titles = { status: 'Your Status', group: 'Group Status', players: 'Players' };
  let body = '';
  if (open === 'status') body = renderPlayerStats(d.player.stats, d.player.status);
  if (open === 'group') body = renderGroupStats(d.groupStats);
  if (open === 'players') body = renderPlayerList(d.players);
  return html`<div class="info-modal ${open ? 'is-open' : ''}" id="infoModal" aria-hidden="${open ? 'false' : 'true'}">
    <button class="info-modal__backdrop" type="button" data-close-info aria-label="Close ${esc(titles[open] || 'information')}"></button>
    <section class="info-modal__sheet" role="dialog" aria-modal="true" aria-labelledby="infoModalTitle">
      <div class="header">
        <h2 id="infoModalTitle">${esc(titles[open] || 'Game Information')}</h2>
        <button class="btn small" type="button" data-close-info>Close</button>
      </div>
      <div class="info-modal__body">${body}</div>
    </section>
  </div>`;
}

function bindPlayerInfoModal() {
  document.querySelectorAll('[data-info-panel]').forEach(btn => btn.addEventListener('click', () => {
    state.openInfoPanel = btn.dataset.infoPanel || null;
    renderPlayer();
  }));
  document.querySelectorAll('[data-close-info]').forEach(btn => btn.addEventListener('click', () => {
    state.openInfoPanel = null;
    renderPlayer();
  }));
}

function renderPlayerPhase(d) {
  const s = d.session, p = d.player, round = d.round, e = d.episode;
  if (s.phase === 'lobby') return html`<div class="panel"><h2>Waiting to Begin</h2><p>The host has not started ${esc(e.title)} yet.</p><p><strong>Scheduled:</strong> ${esc(formatSchedule(s))}</p><p class="tagline">${esc(e.tagline)}</p></div>`;
  if (s.phase === 'role_reveal') return html`<div class="panel goodbox"><h2>Role Revealed</h2><p>You are the <strong>${esc(p.role?.name)}</strong>. Your skill may be the reason the group survives ${esc(e.finalThreat)}.</p></div>`;
  if (s.phase === 'public_event') return html`<div class="panel"><div class="kicker">Public Event</div><h2>${esc(round.title)}</h2><p>${esc(round.publicEvent)}</p><div class="log"><strong>Group Goal:</strong> ${esc(round.groupGoal)}</div></div>`;
  if (s.phase === 'private_scenario') return renderPrivateCard(d);
  if (s.phase === 'public_discussion') return html`<div class="panel"><h2>Public Discussion</h2><p>Talk openly. Make a plan. Decide who can be trusted before the private alliance phase opens.</p></div>`;
  if (s.phase === 'private_alliance') return renderAlliancePanel(d);
  if (s.phase === 'choice_lock') return renderChoiceLock(d);
  if (s.phase === 'round_results') return renderRoundResult(d);
  if (s.phase === 'final_intro') return renderFinalIntro(d);
  if (s.phase === 'final_choice') return renderFinalChoice(d);
  if (s.phase === 'ending') return renderEnding(d);
  return `<div class="panel"><p>Waiting for host.</p></div>`;
}
function renderPrivateCard(d) { const card = d.player.privateCard, decision = d.player.privateCardDecision?.type; if (!card) return `<div class="panel"><h2>Private Scenario</h2><p class="muted">Waiting for private card.</p></div>`; return html`<div class="panel"><div class="kicker">Private Scenario</div><h2>${esc(card.title)}</h2><p>${esc(card.text)}</p><p class="muted">Other players cannot see this. Choose how to handle the secret.</p><div class="grid two">${['reveal','hide','trade','selfish'].map(type => html`<button class="btn ${decision===type?'primary':''}" data-card-decision="${type}" ${decision?'disabled':''}>${decisionLabel(type)}</button>`).join('')}</div>${decision ? `<p class="goodbox panel small">Locked private card decision: ${esc(decisionLabel(decision))}</p>` : ''}</div>`; }
function decisionLabel(type) { return ({ reveal:'Reveal it to help the group', hide:'Hide it for yourself', trade:'Trade it privately', selfish:'Use it selfishly' })[type] || type; }
function renderAlliancePanel(d) { const p = d.player, others = d.players.filter(x => x.id !== p.id); return html`<div class="panel"><h2>Private Alliance</h2><p>Make a deal. Tell the truth. Lie. Betray. Choose carefully.</p><div class="grid two"><form class="form" id="pmForm"><h3>Direct Message</h3><p class="muted small">${2 - (p.privateMessagesUsed || 0)} private messages remaining this round.</p><label>To<select name="toPlayerId">${others.map(o => `<option value="${o.id}">${esc(o.alias)}</option>`).join('')}</select></label><label>Message<textarea name="message" placeholder="Vote with me and I’ll share what I found."></textarea></label><button class="btn primary" type="submit">Send Private Message</button></form><form class="form" id="allianceForm"><h3>Create Alliance</h3><label>Alliance Name<input name="name" value="Secret Team" maxlength="32" /></label><div class="grid">${others.map(o => `<label><input type="checkbox" name="memberIds" value="${o.id}" /> ${esc(o.alias)}</label>`).join('')}</div><button class="btn" type="submit">Create Secret Alliance</button></form></div><div class="divider"></div><form class="form" id="groupPmForm"><h3>Alliance Group Message</h3><p class="muted small">${p.groupMessageUsed ? 'Group message already used this round.' : 'You may send 1 alliance group message this round.'}</p><label>Alliance<select name="allianceId">${(d.alliances || []).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label><label>Message<textarea name="message" placeholder="We stick together until the final encounter."></textarea></label><button class="btn" type="submit">Send Alliance Message</button></form></div>`; }
function renderChoiceLock(d) { const round = d.round, current = d.player.currentChoice?.choiceType; if (!round) return `<div class="panel"><p>Waiting for round.</p></div>`; return html`<div class="panel"><h2>Choose Your Action</h2><p class="muted">Each player gets one main action this round.</p><div class="grid three">${choiceCard('help_group', 'Help the Group', round.choices.help_group, current)}${choiceCard('help_self', 'Help Yourself', round.choices.help_self, current)}${choiceCard('take_risk', 'Take a Risk', round.choices.take_risk, current)}</div><button class="btn primary full" id="lockChoiceBtn" ${current ? 'disabled' : ''}>${current ? 'Choice Locked' : 'Lock Choice'}</button></div>`; }
function choiceCard(type, title, def, current) { return html`<button class="choice-card ${current===type?'selected':''}" data-choice="${type}" ${current?'disabled':''}><div class="type">${esc(title)}</div><h3>${esc(def.label)}</h3><p>${esc(def.preview)}</p></button>`; }
function renderRoundResult(d) { const result = d.latestResult; if (!result) return `<div class="panel"><h2>Results</h2><p>Waiting for the host to reveal results.</p></div>`; const changes = result.playerChanges?.[d.player.id] || {}; return html`<div class="panel"><div class="kicker">Round Result</div><h2>${esc(result.roundTitle)}</h2><div class="log">${esc(result.publicSummary)}</div><div class="divider"></div><h3>Your Changes</h3>${Object.keys(changes).length ? `<div class="stat-list">${Object.entries(changes).map(([k,v]) => `<div class="stat"><div class="name">${esc(statLabel(k))}</div><div class="value">${v > 0 ? '+' : ''}${esc(v)}</div></div>`).join('')}</div>` : '<p class="muted">No personal stat change this round.</p>'}</div>`; }
function renderFinalIntro(d) { return html`<div class="panel warning"><div class="kicker">Final Encounter</div><h2>${esc(d.episode.finalIntroTitle)}</h2><div class="log">${esc(d.episode.finalIntroText)}</div></div>`; }
function renderFinalChoice(d) { const current = d.player.finalChoice, choices = d.episode.finalChoices || {}; const ordered = ['fight_together','set_trap','run_raft','sacrifice','betray_group']; return html`<div class="panel warning"><h2>Final Choice</h2><p>${esc(d.episode.finalThreat)} is here. Choose how your story ends.</p><div class="grid two">${ordered.map(id => html`<button class="choice-card ${current===id?'selected':''}" data-final-choice="${id}" ${current?'disabled':''}><div class="type">Final Action</div><h3>${esc(choices[id]?.label || id)}</h3><p>${esc(choices[id]?.description || '')}</p></button>`).join('')}</div><button class="btn primary full" id="lockFinalBtn" ${current?'disabled':''}>${current ? 'Final Choice Locked' : 'Lock Final Choice'}</button></div>`; }
function renderEnding(d) { const final = d.final; return html`<div class="panel ${final?.outcomeKey === 'full' ? 'goodbox' : 'warning'}"><div class="kicker">Ending</div><h2>${esc(final?.outcome || 'The End')}</h2><p>${esc(final?.endingText || '')}</p><div class="divider"></div><h3>Awards</h3><div class="players">${(d.awards || []).map(a => html`<div class="player-row"><div><strong>${esc(a.name)}</strong><small>${esc(a.alias)} · ${esc(a.reason)}</small></div></div>`).join('')}</div><button class="btn" data-return-home>Return Home</button></div>`; }
function renderPlayerChat(d) { const s = d.session; const publicOpen = ['public_discussion','private_alliance','choice_lock','round_results'].includes(s.phase); return html`<div class="grid two"><div class="panel"><h2>${esc(d.episode.chatTitle || 'Public Chat')}</h2><div class="chatbox">${renderMessages(d.publicChat || [])}</div><form class="form" id="publicChatForm"><label>Public message<textarea name="message" ${publicOpen?'':'disabled'} placeholder="We need a plan."></textarea></label><button class="btn" ${publicOpen?'':'disabled'}>Send</button></form></div><div class="panel"><h2>Private Messages</h2><div class="chatbox">${renderPrivateMessages(d.privateMessages || [])}</div></div></div>`; }

function bindPlayerEvents(d) {
  const code = d.session.code, pid = d.player.id;
  document.querySelectorAll('[data-card-decision]').forEach(btn => btn.addEventListener('click', async () => { try { await api(`/api/sessions/${code}/players/${pid}/private-card`, { method:'POST', body:{ decision: btn.dataset.cardDecision } }); await fetchState(); } catch (err) { showToast(err.message); } }));
  document.querySelectorAll('[data-choice]').forEach(btn => btn.addEventListener('click', () => { state.selectedChoice = btn.dataset.choice; document.querySelectorAll('[data-choice]').forEach(b => b.classList.toggle('selected', b === btn)); }));
  document.getElementById('lockChoiceBtn')?.addEventListener('click', async () => { if (!state.selectedChoice) return showToast('Choose an action first.'); try { await api(`/api/sessions/${code}/players/${pid}/choice`, { method:'POST', body:{ choiceType: state.selectedChoice } }); state.selectedChoice = null; await fetchState(); } catch (err) { showToast(err.message); } });
  document.querySelectorAll('[data-final-choice]').forEach(btn => btn.addEventListener('click', () => { state.selectedFinal = btn.dataset.finalChoice; document.querySelectorAll('[data-final-choice]').forEach(b => b.classList.toggle('selected', b === btn)); }));
  document.getElementById('lockFinalBtn')?.addEventListener('click', async () => { if (!state.selectedFinal) return showToast('Choose a final action first.'); try { await api(`/api/sessions/${code}/players/${pid}/final-choice`, { method:'POST', body:{ finalChoice: state.selectedFinal } }); state.selectedFinal = null; await fetchState(); } catch (err) { showToast(err.message); } });
  document.getElementById('publicChatForm')?.addEventListener('submit', async e => { e.preventDefault(); const message = new FormData(e.currentTarget).get('message'); try { await api(`/api/sessions/${code}/players/${pid}/public-message`, { method:'POST', body:{ message } }); e.currentTarget.reset(); await fetchState(); } catch (err) { showToast(err.message); } });
  document.getElementById('pmForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); try { await api(`/api/sessions/${code}/players/${pid}/private-message`, { method:'POST', body:{ toPlayerId: fd.get('toPlayerId'), message: fd.get('message') } }); e.currentTarget.reset(); await fetchState(); } catch (err) { showToast(err.message); } });
  document.getElementById('allianceForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); try { await api(`/api/sessions/${code}/players/${pid}/alliance`, { method:'POST', body:{ name: fd.get('name'), memberIds: fd.getAll('memberIds') } }); showToast('Alliance created.'); await fetchState(); } catch (err) { showToast(err.message); } });
  document.getElementById('groupPmForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); try { await api(`/api/sessions/${code}/players/${pid}/private-message`, { method:'POST', body:{ allianceId: fd.get('allianceId'), message: fd.get('message') } }); e.currentTarget.reset(); await fetchState(); } catch (err) { showToast(err.message); } });
}

function renderPlayerStats(stats, status) { return html`<div class="panel"><div class="header"><h2>Your Status</h2><span class="status-pill">${esc(status)}</span></div><div class="stat-list">${statCells(stats, true)}</div></div>`; }
function renderGroupStats(stats, host = false) { return html`<div class="panel"><h2>${host ? 'Group + Hidden Stats' : 'Group Status'}</h2><div class="stat-list">${Object.entries(stats || {}).map(([k,v]) => statCell(k, v, host || k !== 'hiddenThreatLevel', true)).join('')}</div></div>`; }
function statCells(stats, bars=false) { const keys = ['health','hunger','hydration','energy','willToLive','trust','personalEscapeAdvantage','personalFinalBonus','helpedGroup','betrayals','cluesFound','riskActions','selfChoices']; return keys.filter(k => stats && k in stats).map(k => statCell(k, stats[k], bars && ['health','hunger','hydration','energy','willToLive','trust'].includes(k), false)).join(''); }
function statCell(k, v, bar=false, group=false) { const width = Math.max(0, Math.min(100, Number(v) * 10)); return html`<div class="stat"><div class="name">${esc(group ? groupStatLabel(k) : statLabel(k))}</div><div class="value">${esc(v)}</div>${bar ? `<div class="bar"><span style="width:${width}%"></span></div>` : ''}</div>`; }
function statLabel(k) { return ep().statLabels?.[k] || prettyStat(k); }
function groupStatLabel(k) { return ep().groupStatLabels?.[k] || prettyStat(k); }
function prettyStat(k) { return k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()); }
function renderPlayerList(players) { return html`<div class="panel"><h2>Players</h2><div class="players">${players.map(p => html`<div class="player-row"><div><strong>${esc(p.alias)}</strong><small>${esc(p.role?.name || 'Role hidden')} · ${esc(p.status)}</small></div></div>`).join('')}</div></div>`; }
function renderMessages(messages) { return messages.length ? messages.map(m => html`<div class="message ${m.system?'system':''}"><div class="meta">${esc(m.alias || ep().systemAlias || 'System')}</div><div>${esc(m.message)}</div></div>`).join('') : '<p class="muted">No messages yet.</p>'; }
function renderPrivateMessages(messages) { return messages.length ? messages.map(m => html`<div class="message"><div class="meta">${esc(m.fromAlias || 'Unknown')} ${m.allianceName ? '→ ' + esc(m.allianceName) : '→ ' + esc(m.toAlias || 'You')}</div><div>${esc(m.message)}</div></div>`).join('') : '<p class="muted">No private messages yet.</p>'; }
function roleName(roleId) { const role = ep().roles?.find?.(r => r.id === roleId); return role?.name || roleId || 'No role yet'; }
function finalChoiceLabel(id) { if (!id) return '—'; return ep().finalChoices?.[id]?.label || prettyStat(id); }

const urlCode = new URLSearchParams(location.search).get('code');
loadEpisodes().then(() => {
  if (urlCode && routeMode === 'player' && !localStorage.getItem('is_code')) {
    state.view = 'home';
    renderHome();
    setTimeout(() => { const input = document.querySelector('input[name="code"]'); if (input) input.value = urlCode.toUpperCase(); }, 0);
  } else if (state.view === 'host' || state.view === 'player') startPolling(); else renderHome();
});
