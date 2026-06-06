const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initPersistence, saveSession, deleteSession, persistenceInfo } = require('./db');
const { getEpisode, episodeSummaries } = require('./episodes');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const sessions = new Map();
global.__ISLAND_SURVIVOR_SESSIONS__ = sessions;

const phaseOrder = ['role_reveal','public_event','private_scenario','public_discussion','private_alliance','choice_lock','round_results'];
const activeStatuses = new Set(['active', 'injured', 'critical', 'outcast', 'weak', 'panicked']);
const finalChoiceIds = ['fight_together', 'set_trap', 'run_raft', 'sacrifice', 'betray_group'];

const phaseDurationsByMode = {
  quick: { role_reveal: 15, public_event: 20, private_scenario: 30, public_discussion: 60, private_alliance: 60, choice_lock: 45, round_results: 30, final_intro: 30, final_choice: 45 },
  standard: { role_reveal: 20, public_event: 30, private_scenario: 45, public_discussion: 90, private_alliance: 90, choice_lock: 60, round_results: 45, final_intro: 45, final_choice: 60 },
  long: { role_reveal: 30, public_event: 45, private_scenario: 60, public_discussion: 120, private_alliance: 120, choice_lock: 90, round_results: 60, final_intro: 60, final_choice: 90 }
};
const automationLocks = new Set();
function validPin(pin) { return /^\d{4}$/.test(String(pin || '')); }
function hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 64).toString('hex'); }
function setHostPin(session, pin) {
  if (!validPin(pin)) throw new Error('Host PIN must be exactly 4 digits.');
  session.hostPinSalt = crypto.randomBytes(16).toString('hex');
  session.hostPinHash = hashPin(pin, session.hostPinSalt);
}
function verifyHostPin(session, pin) {
  if (!validPin(pin) || !session.hostPinHash || !session.hostPinSalt) return false;
  const actual = Buffer.from(hashPin(pin, session.hostPinSalt), 'hex');
  const expected = Buffer.from(session.hostPinHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function phaseDurationSeconds(session, phase = session.phase) {
  const mode = phaseDurationsByMode[session.mode] ? session.mode : 'standard';
  const scale = Math.max(0.01, Number(process.env.PHASE_TIME_SCALE || 1));
  return (phaseDurationsByMode[mode][phase] || 0) * scale;
}
function setPhase(session, phase, durationSeconds) {
  session.phase = phase;
  session.phaseStartedAt = now();
  const seconds = durationSeconds ?? phaseDurationSeconds(session, phase);
  session.phaseEndsAt = seconds > 0 && session.autoRunEnabled && !session.paused ? new Date(Date.now() + seconds * 1000).toISOString() : null;
  session.remainingMs = null;
}
function pauseAutomation(session) {
  if (session.paused) return;
  session.paused = true;
  session.remainingMs = session.phaseEndsAt ? Math.max(0, new Date(session.phaseEndsAt).getTime() - Date.now()) : null;
  session.phaseEndsAt = null;
}
function resumeAutomation(session) {
  session.paused = false;
  const ms = Number.isFinite(session.remainingMs) ? session.remainingMs : phaseDurationSeconds(session) * 1000;
  session.phaseStartedAt = now();
  session.phaseEndsAt = session.autoRunEnabled && ms > 0 ? new Date(Date.now() + ms).toISOString() : null;
  session.remainingMs = null;
}

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${crypto.randomBytes(5).toString('hex')}`; }
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'IS';
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function clamp(n, min = 0, max = 10) { return Math.max(min, Math.min(max, Number(n) || 0)); }
function clampGroup(n) { return Math.max(0, Math.min(20, Number(n) || 0)); }
function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function unique(lines) { return [...new Set((lines || []).filter(Boolean))]; }
function averageTrust(players) { return players.length ? players.reduce((sum, p) => sum + (p.stats?.trust || 0), 0) / players.length : 0; }

function defaultPlayerStats() {
  return {
    health: 10,
    hunger: 10,
    hydration: 10,
    energy: 10,
    willToLive: 10,
    trust: 5,
    personalEscapeAdvantage: 0,
    personalFinalBonus: 0,
    helpedGroup: 0,
    betrayals: 0,
    cluesFound: 0,
    riskActions: 0,
    selfChoices: 0
  };
}
function defaultGroupStats() {
  return {
    campSafety: 3,
    fire: 2,
    foodSupply: 4,
    waterSupply: 4,
    escapeProgress: 0,
    threatAwareness: 0,
    cluesFound: 0,
    finalEncounterBonus: 0,
    hiddenThreatLevel: 0,
    trustPressure: 0
  };
}

function createSession(body = {}) {
  let code;
  do { code = randomCode(); } while (sessions.has(code));
  const episodeId = getEpisode(body.episodeId || 'island').id;
  const ep = getEpisode(episodeId);
  const maxPlayers = Math.max(2, Math.min(6, Number(body.maxPlayers || 6)));
  const session = {
    id: id('session'),
    code,
    hostKey: crypto.randomBytes(16).toString('hex'),
    hostPinSalt: null,
    hostPinHash: null,
    hostPinFailures: 0,
    hostPinLockedUntil: null,
    episodeId,
    venueName: String(body.venueName || ep.venueDefault || ep.title).slice(0, 60),
    mode: phaseDurationsByMode[body.mode] ? body.mode : 'standard',
    scheduledDate: String(body.scheduledDate || '').slice(0, 10),
    scheduledTime: String(body.scheduledTime || '').slice(0, 5),
    scheduledAt: null,
    autoRunEnabled: body.autoRunEnabled !== false && body.autoRunEnabled !== 'false',
    autoStartEnabled: body.autoStartEnabled === true || body.autoStartEnabled === 'true',
    paused: false,
    phaseStartedAt: null,
    phaseEndsAt: null,
    remainingMs: null,
    maxPlayers,
    status: 'lobby',
    phase: 'lobby',
    currentRound: 0,
    createdAt: now(),
    startedAt: null,
    endedAt: null,
    players: [],
    groupStats: defaultGroupStats(),
    chats: [],
    privateMessages: [],
    alliances: [],
    roundResults: [],
    final: null,
    awards: []
  };
  if (session.scheduledDate && session.scheduledTime) {
    const scheduled = new Date(`${session.scheduledDate}T${session.scheduledTime}:00`);
    if (Number.isNaN(scheduled.getTime())) throw new Error('Invalid scheduled date or time.');
    session.scheduledAt = scheduled.toISOString();
  }
  setHostPin(session, body.hostPin);
  sessions.set(code, session);
  return session;
}

function migrateSession(session) {
  if (!session.episodeId) session.episodeId = 'island';
  session.players = session.players || [];
  session.groupStats = { ...defaultGroupStats(), ...(session.groupStats || {}) };
  session.chats = session.chats || [];
  session.privateMessages = session.privateMessages || [];
  session.alliances = session.alliances || [];
  session.roundResults = session.roundResults || [];
  session.awards = session.awards || [];
  session.autoRunEnabled = session.autoRunEnabled !== false;
  session.autoStartEnabled = session.autoStartEnabled === true;
  session.paused = session.paused === true;
  session.phaseStartedAt = session.phaseStartedAt || null;
  session.phaseEndsAt = session.phaseEndsAt || null;
  session.remainingMs = session.remainingMs ?? null;
  session.scheduledDate = session.scheduledDate || '';
  session.scheduledTime = session.scheduledTime || '';
  session.scheduledAt = session.scheduledAt || null;
  session.hostPinFailures = Number(session.hostPinFailures || 0);
  session.hostPinLockedUntil = session.hostPinLockedUntil || null;
  session.players.forEach(p => {
    p.stats = { ...defaultPlayerStats(), ...(p.stats || {}) };
    p.choices = p.choices || {};
    p.privateCards = p.privateCards || {};
    p.privateCardDecisions = p.privateCardDecisions || {};
    p.privateMessagesUsed = p.privateMessagesUsed || {};
    p.groupMessageUsed = p.groupMessageUsed || {};
    p.hiddenItems = p.hiddenItems || [];
  });
  return session;
}

function getSessionEpisode(session) { return getEpisode(session.episodeId); }
function getRound(session, n = session.currentRound) { return getSessionEpisode(session).rounds.find(r => r.number === n) || null; }
function getRole(session, roleId) { return getSessionEpisode(session).roles.find(r => r.id === roleId) || null; }
function labelStat(session, stat) { return getSessionEpisode(session).statLabels[stat] || getSessionEpisode(session).groupStatLabels[stat] || stat.replace(/[A-Z]/g, m => ' ' + m).replace(/^./, s => s.toUpperCase()); }

function episodePublic(ep) {
  return {
    id: ep.id,
    title: ep.title,
    subtitle: ep.subtitle,
    tagline: ep.tagline,
    finalThreat: ep.finalThreat,
    finalIntroTitle: ep.finalIntroTitle,
    finalIntroText: ep.finalIntroText,
    playerNoun: ep.playerNoun,
    groupName: ep.groupName,
    chatTitle: ep.chatTitle,
    systemAlias: ep.systemAlias,
    joinVerb: ep.joinVerb,
    createButton: ep.createButton,
    statLabels: ep.statLabels,
    groupStatLabels: ep.groupStatLabels,
    roles: ep.roles,
    finalChoices: ep.finalChoices,
    outcomes: ep.outcomes
  };
}
function publicSession(session) {
  const ep = getSessionEpisode(session);
  return {
    id: session.id,
    code: session.code,
    venueName: session.venueName,
    mode: session.mode,
    maxPlayers: session.maxPlayers,
    status: session.status,
    phase: session.phase,
    currentRound: session.currentRound,
    episodeId: session.episodeId,
    episodeTitle: ep.title,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    scheduledDate: session.scheduledDate,
    scheduledTime: session.scheduledTime,
    scheduledAt: session.scheduledAt,
    autoRunEnabled: session.autoRunEnabled,
    paused: session.paused,
    phaseStartedAt: session.phaseStartedAt,
    phaseEndsAt: session.phaseEndsAt,
    serverNow: now()
  };
}
function publicPlayer(session, player) {
  return { id: player.id, alias: player.alias, role: player.role ? getRole(session, player.role) : null, status: player.status, joinedAt: player.joinedAt };
}
function visibleGroupStats(gs) { const { hiddenThreatLevel, ...visible } = gs; return visible; }
function publicFinal(final) { if (!final) return null; const { hiddenThreatLevel, hostBreakdown, ...pub } = final; return pub; }
function aliasOf(session, playerId) { return playerId ? (session.players.find(p => p.id === playerId)?.alias || 'Unknown') : null; }
function allianceName(session, allianceId) { return allianceId ? (session.alliances.find(a => a.id === allianceId)?.name || 'Alliance') : null; }

function playerView(session, playerId) {
  migrateSession(session);
  const player = session.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player session not found. Please rejoin the game.');
  const round = getRound(session);
  const privateCard = player.privateCards?.[session.currentRound] || null;
  const ownPrivateMessages = session.privateMessages.filter(m => m.senderId === playerId || m.recipientId === playerId || (m.allianceId && session.alliances.find(a => a.id === m.allianceId)?.members.includes(playerId)));
  return {
    role: 'player',
    episode: episodePublic(getSessionEpisode(session)),
    session: publicSession(session),
    player: {
      id: player.id,
      alias: player.alias,
      status: player.status,
      role: player.role ? getRole(session, player.role) : null,
      stats: player.stats,
      currentChoice: player.choices?.[session.currentRound] || null,
      finalChoice: player.finalChoice || null,
      privateCard,
      privateCardDecision: player.privateCardDecisions?.[session.currentRound] || null,
      privateMessagesUsed: player.privateMessagesUsed?.[session.currentRound] || 0,
      groupMessageUsed: player.groupMessageUsed?.[session.currentRound] || false
    },
    round,
    players: session.players.map(p => publicPlayer(session, p)),
    groupStats: visibleGroupStats(session.groupStats),
    publicChat: session.chats.filter(m => m.roundNumber === session.currentRound || session.phase === 'lobby').slice(-80),
    privateMessages: ownPrivateMessages.slice(-80).map(m => ({ ...m, fromAlias: aliasOf(session, m.senderId), toAlias: aliasOf(session, m.recipientId), allianceName: allianceName(session, m.allianceId) })),
    alliances: session.alliances.filter(a => a.members.includes(playerId)),
    latestResult: session.roundResults[session.roundResults.length - 1] || null,
    final: session.final ? publicFinal(session.final) : null,
    awards: session.status === 'ended' ? session.awards : []
  };
}
function hostView(session) {
  migrateSession(session);
  return {
    role: 'host',
    episode: episodePublic(getSessionEpisode(session)),
    episodes: episodeSummaries(),
    session: { ...publicSession(session), hostKey: session.hostKey },
    players: session.players,
    groupStats: session.groupStats,
    round: getRound(session),
    rounds: getSessionEpisode(session).rounds,
    publicChat: session.chats.slice(-120),
    privateMessages: session.privateMessages.slice(-160).map(m => ({ ...m, fromAlias: aliasOf(session, m.senderId), toAlias: aliasOf(session, m.recipientId), allianceName: allianceName(session, m.allianceId) })),
    alliances: session.alliances,
    roundResults: session.roundResults,
    latestResult: session.roundResults[session.roundResults.length - 1] || null,
    final: session.final,
    awards: session.awards,
    database: persistenceInfo()
  };
}

function assignRoles(session) {
  const shuffledRoles = shuffle(getSessionEpisode(session).roles);
  session.players.forEach((p, i) => { p.role = shuffledRoles[i % shuffledRoles.length].id; });
}
function assignPrivateCardsForRound(session, roundNumber) {
  const cards = shuffle(getSessionEpisode(session).privateCards[roundNumber] || []);
  session.players.forEach((p, i) => {
    p.privateCards = p.privateCards || {};
    p.privateCardDecisions = p.privateCardDecisions || {};
    if (!p.privateCards[roundNumber] && cards.length) p.privateCards[roundNumber] = cards[i % cards.length];
  });
}
function pushSystemChat(session, message) {
  const ep = getSessionEpisode(session);
  session.chats.push({ id: id('chat'), system: true, sessionCode: session.code, roundNumber: session.currentRound, playerId: null, alias: ep.systemAlias || ep.title, message, createdAt: now() });
}
function startGame(session) {
  if (session.players.length < 1) throw new Error('Add at least one player before starting.');
  assignRoles(session);
  session.status = 'active';
  setPhase(session, 'role_reveal');
  session.currentRound = 1;
  session.startedAt = now();
  session.groupStats = defaultGroupStats();
  session.final = null;
  session.awards = [];
  assignPrivateCardsForRound(session, 1);
  pushSystemChat(session, `${getSessionEpisode(session).title} has begun. Roles have been revealed.`);
}
function advancePhase(session) {
  if (session.status === 'lobby') return startGame(session);
  if (session.status === 'final') {
    if (session.phase === 'final_intro') setPhase(session, 'final_choice');
    else if (session.phase === 'final_choice') resolveFinal(session);
    return;
  }
  if (session.status === 'ended') return;
  if (session.phase === 'choice_lock') return resolveRound(session);
  if (session.phase === 'round_results') {
    const ep = getSessionEpisode(session);
    if (session.currentRound >= ep.maxRounds) return startFinal(session);
    session.currentRound += 1;
    setPhase(session, 'public_event');
    assignPrivateCardsForRound(session, session.currentRound);
    pushSystemChat(session, `Round ${session.currentRound}: ${getRound(session).title} has begun.`);
    return;
  }
  const idx = phaseOrder.indexOf(session.phase);
  if (idx >= 0 && idx < phaseOrder.length - 1) {
    setPhase(session, phaseOrder[idx + 1]);
    if (session.phase === 'private_scenario') assignPrivateCardsForRound(session, session.currentRound);
  } else if (session.phase === 'role_reveal') {
    setPhase(session, 'public_event');
  }
}
function startFinal(session) {
  session.status = 'final';
  setPhase(session, 'final_intro');
  const ep = getSessionEpisode(session);
  pushSystemChat(session, `${ep.finalIntroTitle}: ${ep.finalThreat} is here.`);
}

function addDelta(deltas, key, amount) { if (key && amount) deltas[key] = (deltas[key] || 0) + amount; }
function applyPlayerDelta(player, key, amount) { if (key && amount && key in player.stats) player.stats[key] = clamp(player.stats[key] + amount); }
function applyGroupDelta(groupStats, key, amount) {
  if (!key || !amount || !(key in groupStats)) return;
  groupStats[key] = key === 'hiddenThreatLevel' ? clamp(groupStats[key] + amount, 0, 10) : clampGroup(groupStats[key] + amount);
}

function resolveRound(session) {
  const round = getRound(session);
  if (!round) throw new Error('No active round to resolve.');
  const activePlayers = session.players.filter(p => activeStatuses.has(p.status));
  activePlayers.forEach(p => {
    p.choices = p.choices || {};
    if (!p.choices[session.currentRound]) p.choices[session.currentRound] = { choiceType: 'help_self', choiceLabel: 'Protect Yourself', auto: true, submittedAt: now() };
  });

  const counts = { help_group: 0, help_self: 0, take_risk: 0 };
  activePlayers.forEach(p => { const t = p.choices[session.currentRound]?.choiceType; counts[t] = (counts[t] || 0) + 1; });

  const publicLines = [];
  const hostLines = [];
  const playerChanges = {};
  function track(player, key, amount) {
    if (!playerChanges[player.id]) playerChanges[player.id] = {};
    addDelta(playerChanges[player.id], key, amount);
    applyPlayerDelta(player, key, amount);
  }
  function group(key, amount) { applyGroupDelta(session.groupStats, key, amount); }

  for (const player of activePlayers) {
    const choiceMade = player.choices[session.currentRound];
    const def = round.choices[choiceMade.choiceType];
    if (!def) continue;

    if (choiceMade.choiceType === 'help_group') {
      player.stats.helpedGroup += 1;
      track(player, 'trust', 1);
      track(player, 'energy', -Math.abs(def.energyCost || 1));
      if (def.groupStat && def.groupGain) group(def.groupStat, def.groupGain);
      if (player.role === 'builder' && ['campSafety', 'escapeProgress', 'fire', 'waterSupply'].includes(def.groupStat)) {
        group(def.groupStat, 1);
        hostLines.push(`${player.alias}'s ${getRole(session, player.role)?.name || 'builder'} ability added +1 ${labelStat(session, def.groupStat)}.`);
      }
      if (player.role === 'hunter') {
        if (session.currentRound <= 3) group('foodSupply', 1); else group('campSafety', 1);
        hostLines.push(`${player.alias}'s ${getRole(session, player.role)?.name || 'guard'} ability protected the group.`);
      }
      if (player.role === 'negotiator') {
        const lowest = activePlayers.reduce((a, b) => (a.stats.trust <= b.stats.trust ? a : b), activePlayers[0]);
        if (lowest) { track(lowest, 'trust', 1); hostLines.push(`${player.alias}'s ${getRole(session, player.role)?.name || 'negotiator'} ability restored trust for ${lowest.alias}.`); }
      }
    }

    if (choiceMade.choiceType === 'help_self') {
      player.stats.selfChoices += 1;
      const gainKey = def.personalStat || 'willToLive';
      track(player, gainKey, def.personalGain || 1);
      if (def.personalEscapeGain) track(player, 'personalEscapeAdvantage', def.personalEscapeGain);
      if (def.personalFinalBonus) track(player, 'personalFinalBonus', def.personalFinalBonus);
      const trustLoss = Math.abs(def.trustCost || 1);
      track(player, 'trust', -trustLoss);
      if (trustLoss >= 2 || def.groupLoss) player.stats.betrayals += 1;
      if (def.groupStat && def.groupLoss) group(def.groupStat, -Math.abs(def.groupLoss));
      if (def.hiddenItem) player.hiddenItems.push(def.hiddenItem);
      if (counts.help_self >= Math.ceil(activePlayers.length / 2)) group('hiddenThreatLevel', 1);
      hostLines.push(`${player.alias} helped themselves with ${def.label}.`);
    }

    if (choiceMade.choiceType === 'take_risk') {
      player.stats.riskActions += 1;
      track(player, 'energy', -Math.abs(def.energyCost || 2));
      if (def.personalStat && def.personalGain) track(player, def.personalStat, def.personalGain);
      if (def.groupStat && def.groupGain) group(def.groupStat, def.groupGain);
      if (def.finalBonusGain) group('finalEncounterBonus', def.finalBonusGain);
      let clueChance = def.clueChance || 0.5;
      let injuryChance = def.injuryChance || 0.35;
      if (player.role === 'scout') { clueChance += 0.25; injuryChance -= 0.20; }
      if (player.role === 'skeptic') clueChance += 0.10;
      const clueHit = Math.random() < Math.min(0.95, clueChance);
      const injuryHit = Math.random() < Math.max(0.05, injuryChance);
      if (clueHit && def.clueText) {
        group('cluesFound', 1);
        group('threatAwareness', 1);
        player.stats.cluesFound += 1;
        publicLines.push(def.clueText);
        hostLines.push(`${player.alias} discovered a clue: ${def.clueText}`);
      }
      if (def.rewardStat && def.rewardGain && Math.random() < 0.65) {
        group(def.rewardStat, def.rewardGain);
        hostLines.push(`${player.alias} recovered ${labelStat(session, def.rewardStat)} while taking a risk.`);
      }
      if (injuryHit) {
        let damage = 1;
        const medic = activePlayers.find(p => p.role === 'medic' && p.id !== player.id && p.choices?.[session.currentRound]?.choiceType === 'help_group');
        if (medic) { damage = 0; hostLines.push(`${medic.alias}'s ${getRole(session, medic.role)?.name || 'Medic'} ability prevented injury to ${player.alias}.`); }
        if (damage) { track(player, 'health', -damage); publicLines.push('Someone was hurt taking a dangerous risk.'); }
      }
      group('hiddenThreatLevel', 1);
    }
  }

  if (round.teamBonus && counts.help_group >= round.teamBonus.threshold) {
    group(round.teamBonus.stat, round.teamBonus.amount);
    publicLines.push(round.teamBonus.text);
    session.groupStats.hiddenThreatLevel = clamp(session.groupStats.hiddenThreatLevel - 1, 0, 10);
  }
  if (round.trapBonus && counts.take_risk >= round.trapBonus.threshold) {
    group('finalEncounterBonus', round.trapBonus.amount);
    publicLines.push(round.trapBonus.text);
  }
  if (round.failure && counts.help_group < round.failure.threshold) {
    group(round.failure.stat, round.failure.amount);
    publicLines.push(round.failure.text);
    group('hiddenThreatLevel', 1);
  }

  for (const player of activePlayers) {
    const decision = player.privateCardDecisions?.[session.currentRound];
    const card = player.privateCards?.[session.currentRound];
    if (!card || !decision || decision.resolved) continue;
    const effect = card[decision.type] || {};
    for (const [key, amount] of Object.entries(effect)) {
      if (key in player.stats) track(player, key, amount);
      else if (key in session.groupStats) group(key, amount);
      else if (key === 'hiddenThreat') group('hiddenThreatLevel', amount);
      else if (key === 'groupTrustBoost') activePlayers.forEach(p => track(p, 'trust', amount));
    }
    if (decision.type === 'reveal') publicLines.push(`${player.alias} revealed a secret that helped the group.`);
    if (decision.type === 'selfish') { player.stats.betrayals += 1; publicLines.push('Someone used a private secret for themselves.'); }
    decision.resolved = true;
    hostLines.push(`${player.alias} resolved private card '${card.title}' as ${decision.type}.`);
  }

  if (averageTrust(activePlayers) < 4) group('hiddenThreatLevel', 1);
  if (activePlayers.length < 3) group('hiddenThreatLevel', 2);

  for (const player of activePlayers) {
    const old = player.status;
    player.status = statusFromStats(player.stats);
    if (player.status !== old) publicLines.push(`${player.alias} is now ${player.status}.`);
    if (['dead','lost'].includes(player.status)) player.eliminatedAt = now();
  }

  const publicSummary = buildPublicSummary(session, round, counts, publicLines);
  const hostSummary = buildHostSummary(session, round, counts, hostLines, playerChanges);
  session.roundResults.push({ id: id('result'), sessionCode: session.code, roundNumber: round.number, roundTitle: round.title, publicSummary, hostSummary, counts, playerChanges, groupStats: { ...session.groupStats }, createdAt: now() });
  setPhase(session, 'round_results');
}

function buildPublicSummary(session, round, counts, lines) {
  const ep = getSessionEpisode(session);
  const base = [];
  if (counts.help_group >= 3) base.push('The group pulled together when it mattered.');
  else if (counts.help_group === 0) base.push(`No one truly helped the ${ep.groupName.toLowerCase()}, and the pressure punished that choice.`);
  else base.push('Some helped the group, but not everyone was working together.');
  if (counts.help_self >= 2) base.push('Several players protected themselves instead of the group.');
  if (counts.take_risk > 0) base.push('Someone took a dangerous risk beyond the safest plan.');
  const pressure = session.groupStats.hiddenThreatLevel >= 7 ? `${ep.finalThreat} feels very close.` : session.groupStats.hiddenThreatLevel >= 4 ? 'The pressure is rising. Something is watching the group fracture.' : 'For now, the threat keeps its distance.';
  return [...base, ...unique(lines), pressure].join('\n');
}
function buildHostSummary(session, round, counts, lines, playerChanges) {
  return [`Round ${round.number} resolved. Choices: ${counts.help_group} Help Group, ${counts.help_self} Help Self, ${counts.take_risk} Take Risk.`, ...unique(lines), `Hidden pressure is now ${session.groupStats.hiddenThreatLevel}.`, `Player changes: ${JSON.stringify(playerChanges)}`].join('\n');
}
function statusFromStats(stats) {
  if (stats.health <= 0) return 'dead';
  if (stats.hydration <= 0) return 'dead';
  if (stats.willToLive <= 0) return 'lost';
  if (stats.health <= 1) return 'critical';
  if (stats.health <= 3) return 'injured';
  if (stats.hydration <= 3 || stats.hunger <= 3) return 'weak';
  if (stats.willToLive <= 3) return 'panicked';
  if (stats.trust <= 0) return 'outcast';
  return 'active';
}

function resolveFinal(session) {
  const ep = getSessionEpisode(session);
  if (session.status !== 'final') return;
  const survivors = session.players.filter(p => !['dead','lost'].includes(p.status));
  survivors.forEach(p => { if (!p.finalChoice) p.finalChoice = 'run_raft'; });
  const choiceCounts = survivors.reduce((acc, p) => { acc[p.finalChoice] = (acc[p.finalChoice] || 0) + 1; return acc; }, {});
  const survivorPoints = survivors.length >= 4 ? 4 : survivors.length === 3 ? 2 : survivors.length === 2 ? -2 : -5;
  const escapePoints = session.groupStats.escapeProgress >= 5 ? 3 : session.groupStats.escapeProgress >= 3 ? 1 : 0;
  const cluePoints = session.groupStats.cluesFound >= 3 ? 3 : session.groupStats.cluesFound >= 1 ? 1 : 0;
  const awarenessPoints = session.groupStats.threatAwareness >= 3 ? 2 : session.groupStats.threatAwareness >= 1 ? 1 : 0;
  const trustAvg = averageTrust(survivors);
  const trustPoints = trustAvg >= 5 ? 3 : trustAvg >= 3 ? 0 : -3;
  const threatPenalty = session.groupStats.hiddenThreatLevel >= 9 ? -5 : session.groupStats.hiddenThreatLevel >= 7 ? -3 : 0;
  const criticalPenalty = -survivors.filter(p => p.status === 'critical').length;
  const roleBonus = computeRoleBonus(survivors);
  const finalChoiceBonus = computeFinalChoiceBonus(choiceCounts, session.groupStats, survivors);
  const betrayalPenalty = (choiceCounts.betray_group || 0) * -4;
  const sacrificeBonus = (choiceCounts.sacrifice || 0) * 3;
  const score = survivorPoints + escapePoints + cluePoints + awarenessPoints + session.groupStats.finalEncounterBonus + trustPoints + threatPenalty + criticalPenalty + roleBonus + finalChoiceBonus + betrayalPenalty + sacrificeBonus;
  const outcomeKey = endingKeyFromScore(score);
  session.final = {
    survivorsCount: survivors.length,
    averageTrust: Math.round(trustAvg * 10) / 10,
    escapeProgress: session.groupStats.escapeProgress,
    cluesFound: session.groupStats.cluesFound,
    threatAwareness: session.groupStats.threatAwareness,
    finalBonus: session.groupStats.finalEncounterBonus,
    hiddenThreatLevel: session.groupStats.hiddenThreatLevel,
    choiceCounts,
    roleBonus,
    finalChoiceBonus,
    score,
    outcomeKey,
    outcome: ep.outcomes[outcomeKey],
    endingText: ep.endingTexts[outcomeKey],
    hostBreakdown: { survivorPoints, escapePoints, cluePoints, awarenessPoints, trustPoints, threatPenalty, criticalPenalty, roleBonus, finalChoiceBonus, betrayalPenalty, sacrificeBonus }
  };
  applyFinalStatuses(session, outcomeKey, survivors);
  assignAwards(session);
  session.status = 'ended';
  session.phase = 'ending';
  session.phaseStartedAt = now();
  session.phaseEndsAt = null;
  session.endedAt = now();
}
function computeRoleBonus(survivors) { return new Set(survivors.map(p => p.role)).size; }
function computeFinalChoiceBonus(choiceCounts, groupStats, survivors) {
  let bonus = 0;
  if ((choiceCounts.fight_together || 0) >= 3) bonus += 2;
  if ((choiceCounts.set_trap || 0) >= 2 && groupStats.cluesFound >= 3) bonus += 2;
  if ((choiceCounts.run_raft || 0) >= 2 && groupStats.escapeProgress >= 5) bonus += 2;
  if ((choiceCounts.betray_group || 0) && survivors.length <= 2) bonus -= 2;
  return bonus;
}
function endingKeyFromScore(score) { if (score >= 10) return 'full'; if (score >= 6) return 'broken'; if (score >= 2) return 'partial'; if (score >= 0) return 'wounded'; return 'lost'; }
function applyFinalStatuses(session, outcomeKey, survivors) {
  if (outcomeKey === 'full') survivors.forEach(p => { p.status = 'escaped'; });
  else if (outcomeKey === 'broken') survivors.forEach((p, i) => { p.status = i < Math.max(1, Math.ceil(survivors.length * 0.65)) ? 'escaped' : 'lost'; });
  else if (outcomeKey === 'partial') survivors.sort((a,b)=>finalPersonalScore(b)-finalPersonalScore(a)).forEach((p,i)=>{ p.status = i < 2 ? 'escaped':'lost'; });
  else if (outcomeKey === 'wounded') survivors.sort((a,b)=>finalPersonalScore(b)-finalPersonalScore(a)).forEach((p,i)=>{ p.status = i === 0 ? 'escaped':'lost'; });
  else survivors.forEach(p => { p.status = 'lost'; });
}
function finalPersonalScore(p) { return p.stats.health + p.stats.willToLive + p.stats.personalEscapeAdvantage + p.stats.personalFinalBonus + p.stats.trust; }
function assignAwards(session) {
  const ep = getSessionEpisode(session);
  const players = session.players;
  const awards = [];
  function award(name, winner, reason) { if (winner) awards.push({ id: id('award'), name, playerId: winner.id, alias: winner.alias, reason }); }
  award('True Survivor', [...players].sort((a,b)=>finalPersonalScore(b)-finalPersonalScore(a))[0], 'Best overall survival score.');
  award('Most Trusted', [...players].sort((a,b)=>b.stats.trust-a.stats.trust)[0], 'Highest final Trust.');
  award(`${ep.groupName} MVP`, [...players].sort((a,b)=>b.stats.helpedGroup-a.stats.helpedGroup)[0], 'Helped the group the most.');
  award('Biggest Betrayal', [...players].sort((a,b)=>b.stats.betrayals-a.stats.betrayals)[0], 'Most selfish or damaging secret moves.');
  award('The One Who Knew', [...players].sort((a,b)=>b.stats.cluesFound-a.stats.cluesFound)[0], 'Found the most clues.');
  award(`${ep.finalThreat}'s Favorite`, [...players].sort((a,b)=>(b.stats.selfChoices+b.stats.personalEscapeAdvantage+b.stats.betrayals)-(a.stats.selfChoices+a.stats.personalEscapeAdvantage+a.stats.betrayals))[0], 'Played the most self-preserving game.');
  session.awards = awards;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('Invalid JSON body.')); } });
    req.on('error', reject);
  });
}
function sendJson(res, data, status = 200) { const json = JSON.stringify(data); res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json), 'Cache-Control': 'no-store' }); res.end(json); }
function sendError(res, message, status = 400) { sendJson(res, { error: message }, status); }
function requireSession(code) { const session = sessions.get(String(code || '').toUpperCase()); if (!session) throw new Error('Game session not found.'); return migrateSession(session); }
function requireHost(session, key) { if (!key || key !== session.hostKey) throw new Error('Invalid host key.'); }
function requirePlayer(session, playerId) { const player = session.players.find(p => p.id === playerId); if (!player) throw new Error('Player not found.'); return player; }

async function automationTick() {
  const currentMs = Date.now();
  for (const session of sessions.values()) {
    migrateSession(session);
    if (automationLocks.has(session.code) || !session.autoRunEnabled || session.paused || session.status === 'ended') continue;
    if (session.status === 'lobby' && session.autoStartEnabled && session.scheduledAt && new Date(session.scheduledAt).getTime() <= currentMs && session.players.length > 0) {
      automationLocks.add(session.code);
      try { startGame(session); await saveSession(session); } catch (err) { console.error('Auto-start failed', session.code, err); } finally { automationLocks.delete(session.code); }
      continue;
    }
    if (!session.phaseEndsAt || new Date(session.phaseEndsAt).getTime() > currentMs) continue;
    automationLocks.add(session.code);
    try { advancePhase(session); await saveSession(session); } catch (err) { console.error('Auto-advance failed', session.code, err); } finally { automationLocks.delete(session.code); }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && url.pathname === '/api/episodes') return sendJson(res, { episodes: episodeSummaries() });
      if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, { ok: true, database: persistenceInfo(), sessions: sessions.size, episodes: episodeSummaries().length });
      if (req.method === 'POST' && url.pathname === '/api/sessions') {
        const body = await parseBody(req);
        const session = createSession(body);
        await saveSession(session);
        return sendJson(res, { session: publicSession(session), hostKey: session.hostKey, episode: episodePublic(getSessionEpisode(session)) });
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'api' && parts[1] === 'sessions' && parts[2]) {
        const code = parts[2].toUpperCase();
        const session = requireSession(code);
        if (req.method === 'GET' && parts[3] === 'qr.svg') {
          const QRCode = require('qrcode');
          const proto = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers['x-forwarded-host'] || req.headers.host;
          const link = `${proto}://${host}/play?code=${encodeURIComponent(session.code)}`;
          const svg = await QRCode.toString(link, { type: 'svg', margin: 1, width: 360, errorCorrectionLevel: 'M' });
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }); return res.end(svg);
        }
        if (req.method === 'GET' && parts[3] === 'state') {
          const hostKey = url.searchParams.get('hostKey');
          const playerId = url.searchParams.get('playerId');
          if (hostKey && hostKey === session.hostKey) return sendJson(res, hostView(session));
          if (playerId) return sendJson(res, playerView(session, playerId));
          return sendJson(res, { session: publicSession(session), episode: episodePublic(getSessionEpisode(session)), players: session.players.map(p => publicPlayer(session, p)) });
        }
        if (req.method === 'POST' && parts[3] === 'join') {
          const body = await parseBody(req);
          if (session.status !== 'lobby') throw new Error('This game has already started.');
          if (session.players.length >= session.maxPlayers) throw new Error('This game is full.');
          const alias = String(body.alias || '').trim().slice(0, 24);
          if (!alias) throw new Error('Alias is required.');
          if (session.players.some(p => p.alias.toLowerCase() === alias.toLowerCase())) throw new Error('That alias is already taken.');
          const player = { id: id('player'), alias, role: null, status: 'active', joinedAt: now(), eliminatedAt: null, stats: defaultPlayerStats(), choices: {}, privateCards: {}, privateCardDecisions: {}, privateMessagesUsed: {}, groupMessageUsed: {}, hiddenItems: [], finalChoice: null };
          session.players.push(player);
          pushSystemChat(session, `${alias} joined ${getSessionEpisode(session).title}.`);
          await saveSession(session);
          return sendJson(res, { playerId: player.id, session: publicSession(session), player });
        }
        if (req.method === 'POST' && parts[3] === 'host' && parts[4] === 'unlock') {
          const body = await parseBody(req);
          if (session.hostPinLockedUntil && new Date(session.hostPinLockedUntil).getTime() > Date.now()) throw new Error('Host access is temporarily locked. Try again shortly.');
          if (!verifyHostPin(session, body.hostPin)) {
            session.hostPinFailures = (session.hostPinFailures || 0) + 1;
            if (session.hostPinFailures >= 5) { session.hostPinLockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); session.hostPinFailures = 0; }
            await saveSession(session);
            throw new Error('Invalid host PIN.');
          }
          session.hostPinFailures = 0; session.hostPinLockedUntil = null; await saveSession(session);
          return sendJson(res, { hostKey: session.hostKey, session: publicSession(session), episode: episodePublic(getSessionEpisode(session)) });
        }
        if (req.method === 'POST' && parts[3] === 'host' && parts[4] === 'automation') {
          const body = await parseBody(req); requireHost(session, body.hostKey);
          if (body.action === 'pause') pauseAutomation(session);
          else if (body.action === 'resume') resumeAutomation(session);
          else if (body.action === 'enable') { session.autoRunEnabled = true; if (!session.paused && session.status !== 'lobby' && session.status !== 'ended') resumeAutomation(session); }
          else if (body.action === 'disable') { session.autoRunEnabled = false; session.phaseEndsAt = null; session.remainingMs = null; }
          else if (body.action === 'add_time') { const seconds = Math.max(5, Math.min(600, Number(body.seconds || 30))); if (session.phaseEndsAt) session.phaseEndsAt = new Date(new Date(session.phaseEndsAt).getTime() + seconds * 1000).toISOString(); }
          else throw new Error('Invalid automation action.');
          await saveSession(session); return sendJson(res, hostView(session));
        }
        if (req.method === 'POST' && parts[3] === 'host' && parts[4] === 'advance') {
          const body = await parseBody(req); requireHost(session, body.hostKey); advancePhase(session); await saveSession(session); return sendJson(res, hostView(session));
        }
        if (req.method === 'POST' && parts[3] === 'host' && parts[4] === 'delete') {
          const body = await parseBody(req); requireHost(session, body.hostKey);
          const code = session.code;
          automationLocks.delete(code);
          sessions.delete(code);
          try {
            await deleteSession(code, sessions);
          } catch (err) {
            sessions.set(code, session);
            throw err;
          }
          return sendJson(res, { deleted: true, code });
        }
        if (req.method === 'POST' && parts[3] === 'host' && parts[4] === 'reset') {
          const body = await parseBody(req); requireHost(session, body.hostKey);
          const oldCode = session.code, hostKey = session.hostKey, pinSalt = session.hostPinSalt, pinHash = session.hostPinHash;
          const newSession = createSession({ venueName: session.venueName, mode: session.mode, maxPlayers: session.maxPlayers, episodeId: session.episodeId, hostPin: '0000', scheduledDate: session.scheduledDate, scheduledTime: session.scheduledTime, autoRunEnabled: session.autoRunEnabled, autoStartEnabled: session.autoStartEnabled });
          sessions.delete(newSession.code);
          newSession.code = oldCode; newSession.hostKey = hostKey; newSession.hostPinSalt = pinSalt; newSession.hostPinHash = pinHash; sessions.set(oldCode, newSession);
          await saveSession(newSession);
          return sendJson(res, { session: publicSession(newSession), hostKey });
        }
        if (req.method === 'POST' && parts[3] === 'host' && parts[4] === 'remove') {
          const body = await parseBody(req); requireHost(session, body.hostKey); const p = requirePlayer(session, body.playerId);
          session.players = session.players.filter(x => x.id !== p.id);
          pushSystemChat(session, `${p.alias} was removed.`);
          await saveSession(session);
          return sendJson(res, hostView(session));
        }
        if (req.method === 'POST' && parts[3] === 'players' && parts[4]) {
          const player = requirePlayer(session, parts[4]);
          const action = parts[5];
          const body = await parseBody(req);
          if (action === 'choice') {
            if (session.phase !== 'choice_lock') throw new Error('Choices can only be locked during the Choice phase.');
            const choiceType = body.choiceType;
            if (!['help_group','help_self','take_risk'].includes(choiceType)) throw new Error('Invalid choice type.');
            const round = getRound(session);
            player.choices[session.currentRound] = { choiceType, choiceLabel: round.choices[choiceType].label, submittedAt: now() };
            await saveSession(session); return sendJson(res, playerView(session, player.id));
          }
          if (action === 'final-choice') {
            if (session.phase !== 'final_choice') throw new Error('Final choices are not open yet.');
            const finalChoice = body.finalChoice;
            if (!finalChoiceIds.includes(finalChoice)) throw new Error('Invalid final choice.');
            player.finalChoice = finalChoice;
            await saveSession(session); return sendJson(res, playerView(session, player.id));
          }
          if (action === 'private-card') {
            if (!['private_scenario','public_discussion','private_alliance','choice_lock'].includes(session.phase)) throw new Error('Private card decisions are not open.');
            const type = body.decision;
            if (!['reveal','hide','trade','selfish'].includes(type)) throw new Error('Invalid private card decision.');
            player.privateCardDecisions[session.currentRound] = { type, resolved: false, decidedAt: now() };
            await saveSession(session); return sendJson(res, playerView(session, player.id));
          }
          if (action === 'public-message') {
            if (!['public_discussion','private_alliance','choice_lock'].includes(session.phase)) throw new Error('Public messages are not open during this phase.');
            const message = String(body.message || '').trim().slice(0, 500);
            if (!message) throw new Error('Message is required.');
            session.chats.push({ id: id('chat'), sessionCode: session.code, roundNumber: session.currentRound, playerId: player.id, alias: player.alias, message, createdAt: now(), flagged: false });
            await saveSession(session); return sendJson(res, playerView(session, player.id));
          }
          if (action === 'private-message') {
            if (session.phase !== 'private_alliance') throw new Error('Private messages are only open during the alliance phase.');
            const message = String(body.message || '').trim().slice(0, 500);
            if (!message) throw new Error('Message is required.');
            const roundNumber = session.currentRound;
            const allianceId = body.allianceId || null;
            if (allianceId) {
              const alliance = session.alliances.find(a => a.id === allianceId && a.members.includes(player.id));
              if (!alliance) throw new Error('Alliance not found.');
              if (player.groupMessageUsed[roundNumber]) throw new Error('You already used your alliance group message this round.');
              player.groupMessageUsed[roundNumber] = true;
              session.privateMessages.push({ id: id('pm'), sessionCode: session.code, roundNumber, senderId: player.id, recipientId: null, allianceId, message, createdAt: now(), reported: false });
            } else {
              const to = requirePlayer(session, body.toPlayerId);
              const used = player.privateMessagesUsed[roundNumber] || 0;
              if (used >= 2) throw new Error('You have used both private messages this round.');
              player.privateMessagesUsed[roundNumber] = used + 1;
              session.privateMessages.push({ id: id('pm'), sessionCode: session.code, roundNumber, senderId: player.id, recipientId: to.id, allianceId: null, message, createdAt: now(), reported: false });
            }
            await saveSession(session); return sendJson(res, playerView(session, player.id));
          }
          if (action === 'alliance') {
            if (session.phase !== 'private_alliance') throw new Error('Alliances can only be created during private alliance phase.');
            const name = String(body.name || 'Secret Alliance').trim().slice(0, 32);
            const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];
            const members = unique([player.id, ...memberIds.filter(pid => session.players.some(p => p.id === pid))]);
            if (members.length < 2) throw new Error('An alliance needs at least two players.');
            session.alliances.push({ id: id('alliance'), sessionCode: session.code, roundCreated: session.currentRound, name, createdBy: player.id, members, active: true, createdAt: now() });
            await saveSession(session); return sendJson(res, playerView(session, player.id));
          }
        }
      }
      return sendError(res, 'Not found.', 404);
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    sendError(res, err.message || 'Server error.', 400);
  }
});

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendError(res, 'Forbidden', 403);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, data2) => {
        if (err2) return sendError(res, 'Not found', 404);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

async function startServer() {
  const persistence = await initPersistence(sessions);
  for (const [code, session] of sessions.entries()) sessions.set(code, migrateSession(session));
  console.log(`Loaded ${persistence.count} saved session(s) from ${persistence.type} persistence.`);
  server.listen(PORT, () => console.log(`Barfly Choice Engine running on http://localhost:${PORT}`));
  setInterval(() => automationTick().catch(err => console.error('Automation tick failed:', err)), 1000).unref();
  automationTick().catch(err => console.error('Initial automation tick failed:', err));
}
startServer().catch(err => { console.error('Failed to start Barfly Choice Engine:', err); process.exit(1); });
