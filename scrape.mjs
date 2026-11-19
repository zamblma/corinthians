import { existsSync, readFileSync, writeFileSync } from 'fs';

const COMPETITIONS = [
  { id: 1456, name: 'Brasileirão Série A', key: 'brasileirao', espnSlug: 'bra.1' },
  { id: 1457, name: 'Copa Libertadores', key: 'libertadores', espnSlug: 'conmebol.libertadores' },
  { id: 1459, name: 'Copa do Brasil', key: 'copabrasil', espnSlug: 'bra.copa_do_brasil' },
  { id: 1460, name: 'Copa Sudamericana', key: 'sudamericana', espnSlug: 'conmebol.sudamericana' },
  { id: 1455, name: 'Campeonato Paulista', key: 'paulista', espnSlug: 'bra.camp.paulista' },
  { id: 1458, name: 'Supercopa do Brasil', key: 'supercopa', espnSlug: 'bra.supercopa_do_brasil' },
];

const CORINTHIANS_ESPN_ID = '874';
const BASE_URL = 'https://p1.trrsf.com/api/musa-soccer/ms-standings-games-light?idChampionship=ID&idPhase=&language=pt-BR&country=BR&nav=N&timezone=BR';
const STANDINGS_URL = 'https://p1.trrsf.com/api/musa-soccer/ms-standings-light?idChampionship=ID&language=pt-BR&country=BR&nav=N&timezone=BR';
const ESPN_TEAM_SCHEDULE_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/teams/${CORINTHIANS_ESPN_ID}/schedule?lang=pt`;
const ESPN_WEB_ALL_SCHEDULE_URL = `https://site.web.api.espn.com/apis/site/v2/sports/soccer/all/teams/${CORINTHIANS_ESPN_ID}/schedule?lang=pt`;
const ESPN_STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/soccer/{league}/standings?lang=pt';

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

function normText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isCorinthiansName(name) {
  const n = normText(name);
  return n === 'corinthians' || n.includes('corinthians');
}

function parseTime(timeStr) {
  const m = String(timeStr || '').match(/(\d{1,2})h(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function fmtDate(dateStr, timeStr) {
  const t = parseTime(timeStr);
  return t ? `${dateStr}T${t}:00` : `${dateStr}T00:00:00`;
}

function toSaoPauloParts(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? '00' : map.hour;
  const date = `${map.year}-${map.month}-${map.day}`;
  const time = `${hour}:${map.minute}`;
  return { date, time, datetime: `${date}T${time}:00` };
}

function mapCompFromNameOrSlug(leagueName, slug) {
  const s = normText(`${leagueName || ''} ${slug || ''}`);
  if (s.includes('supercopa')) return COMPETITIONS.find(c => c.key === 'supercopa');
  if (s.includes('paulista')) return COMPETITIONS.find(c => c.key === 'paulista');
  if (s.includes('copa do brasil') || s.includes('copa_do_brasil')) return COMPETITIONS.find(c => c.key === 'copabrasil');
  if (s.includes('libertadores')) return COMPETITIONS.find(c => c.key === 'libertadores');
  if (s.includes('sudamericana') || s.includes('sul americana')) return COMPETITIONS.find(c => c.key === 'sudamericana');
  if (s.includes('brasileir') || s.includes('serie a') || s.includes('bra 1')) return COMPETITIONS.find(c => c.key === 'brasileirao');
  return null;
}

async function fetchText(url) {
  const resp = await fetch(url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return await resp.text();
}

async function fetchJson(url) {
  const resp = await fetch(url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return await resp.json();
}

function parseStandings(html, compName, compKey) {
  if (compKey === 'copabrasil' || compKey === 'paulista' || compKey === 'supercopa') return null;

  const rows = html.match(/<tr[^>]*data-idteam="[^"]*"[^>]*>[\s\S]*?<\/tr>/g);
  if (!rows) return null;

  const teams = [];
  for (const row of rows) {
    const posMatch = row.match(/<td class="main position[^"]*"[^>]*>(\d+)<\/td>/);
    const nameMatch = row.match(/<td class="main team-name[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)/);
    const shieldMatch = row.match(/<img[^>]+class="sports-shield"[^>]+src="([^"]+)"/);
    const tds = [...row.matchAll(/<td[^>]*>(-?\d+)<\/td>/g)];
    const zoneMatch = row.match(/class="zone-(\d+)/);
    const moveMatch = row.match(/<td class="main movement (up|down)">(?:<span>[^<]*<\/span>\s*)?(\d+)?/);

    if (!posMatch || !nameMatch) continue;

    const zone = zoneMatch ? parseInt(zoneMatch[1]) : 0;
    let movement = '';
    if (moveMatch) {
      const dir = moveMatch[1] === 'up' ? 'S' : 'D';
      const ct = moveMatch[2] || '';
      movement = dir + ct;
    }

    const name = nameMatch[1].trim();
    teams.push({
      pos: parseInt(posMatch[1]),
      name,
      shield: isCorinthiansName(name) ? 'logocorinthians.svg' : (shieldMatch ? shieldMatch[1] : ''),
      points: parseInt(tds[1]?.[1] || 0),
      games: parseInt(tds[2]?.[1] || 0),
      wins: parseInt(tds[3]?.[1] || 0),
      draws: parseInt(tds[4]?.[1] || 0),
      losses: parseInt(tds[5]?.[1] || 0),
      goalsFor: parseInt(tds[6]?.[1] || 0),
      goalsAgainst: parseInt(tds[7]?.[1] || 0),
      goalDiff: parseInt(tds[8]?.[1] || 0),
      pct: parseInt(tds[9]?.[1] || 0),
      zone,
      movement,
    });
  }

  return teams.length > 0 ? { championship: compName, championshipKey: compKey, teams } : null;
}

function parseEspnStandings(json, comp) {
  const entries = json?.children?.[0]?.standings?.entries || json?.standings?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const teams = [];
  entries.forEach((entry, idx) => {
    const teamName = entry.team?.shortDisplayName || entry.team?.displayName || entry.team?.name || '';
    if (!teamName) return;
    const statsMap = {};
    for (const st of entry.stats || []) {
      statsMap[st.name] = st.value;
    }
    const pos = Math.round(statsMap.rank || idx + 1);
    const games = Math.round(statsMap.gamesPlayed || 0);
    const points = Math.round(statsMap.points || 0);
    const pct = games > 0 ? Math.round((points / (games * 3)) * 100) : 0;
    const shield = isCorinthiansName(teamName)
      ? 'logocorinthians.svg'
      : (entry.team?.logos?.[0]?.href || '');

    let zone = 0;
    if (comp.key === 'brasileirao') {
      if (pos <= 4) zone = 1;
      else if (pos <= 6) zone = 2;
      else if (pos <= 12) zone = 3;
      else if (pos >= 17) zone = 4;
    }

    teams.push({
      pos,
      name: teamName,
      shield,
      points,
      games,
      wins: Math.round(statsMap.wins || 0),
      draws: Math.round(statsMap.ties || 0),
      losses: Math.round(statsMap.losses || 0),
      goalsFor: Math.round(statsMap.pointsFor || 0),
      goalsAgainst: Math.round(statsMap.pointsAgainst || 0),
      goalDiff: Math.round(statsMap.pointDifferential || 0),
      pct,
      zone,
      movement: '',
    });
  });

  teams.sort((a, b) => a.pos - b.pos);
  return teams.length > 0 ? { championship: comp.name, championshipKey: comp.key, teams } : null;
}

function parseLineupPlayers(html) {
  if (!html) return null;
  const lineups = [];
  const sections = html.match(/live__content__lineup__col[\s\S]*?<\/ul>/g);
  if (!sections || sections.length < 2) return null;

  for (const section of sections) {
    const teamMatch = section.match(/title="([^"]+)"(?:[\s\S]*?<h5>([^<]+)<)/);
    const teamName = teamMatch ? teamMatch[1] : '';
    const acronym = teamMatch ? teamMatch[2] : '';

    const players = [];
    const playerMatches = [...section.matchAll(/team-player__number">(\d+)<\/span>\s*<span[^>]+team-player__name[^>]+title="([^"]+)"\s*>([^<]+)/g)];
    for (const pm of playerMatches) {
      players.push({ num: pm[1], pos: pm[2], name: pm[3] });
    }
    if (players.length > 0) lineups.push({ team: teamName, acronym, players });
  }

  return lineups.length > 0 ? lineups : null;
}

function extractMatchFromHtmlBlock(mh, compName, compKey, roundNum, stageLabel) {
  const nameMatch = mh.match(/<meta itemprop="name" content="([^"]+)"\s*>/);
  if (!nameMatch) return null;
  const nameParts = nameMatch[1].split(' x ');
  if (nameParts.length !== 2) return null;
  const [homeTeam, awayTeam] = nameParts.map(t => t.trim());
  if (!isCorinthiansName(homeTeam) && !isCorinthiansName(awayTeam)) return null;

  const dateMatch = mh.match(/<meta itemprop="startDate" content="([^"]+)"\s*>/);
  if (!dateMatch) return null;
  const rawDate = dateMatch[1];

  const timeMatch = mh.match(/<strong class="time[^"]*">\s*([^<]+?)\s*<\/strong>/);
  const timeStr = timeMatch ? timeMatch[1].trim() : '';
  const datetime = fmtDate(rawDate, timeStr);

  const stadiumMatch = mh.match(/<meta content="([^"]+)" itemprop="name"><meta content="[^"]+" itemprop="address"><\/place>/);
  const stadium = stadiumMatch ? stadiumMatch[1] : '';

  const acronyms = [...mh.matchAll(/<span class="acronym">([^<]+)<\/span>/g)];
  const homeAcronym = acronyms.length > 0 ? acronyms[0][1] : '';
  const awayAcronym = acronyms.length > 1 ? acronyms[1][1] : '';

  const shields = [...mh.matchAll(/<img[^>]+class="sports-shield"[^>]+src="([^"]+)"/g)];
  const homeLogo = isCorinthiansName(homeTeam) ? 'logocorinthians.svg' : (shields.length > 0 ? shields[0][1] : '');
  const awayLogo = isCorinthiansName(awayTeam) ? 'logocorinthians.svg' : (shields.length > 1 ? shields[1][1] : '');

  const homeGoalsMatch = mh.match(/<strong class="goals home">(\d+)<\/strong>/);
  const awayGoalsMatch = mh.match(/<strong class="goals away">(\d+)<\/strong>/);
  const homeGoals = homeGoalsMatch ? parseInt(homeGoalsMatch[1]) : null;
  const awayGoals = awayGoalsMatch ? parseInt(awayGoalsMatch[1]) : null;

  const started = homeGoals !== null;
  const hasLiveText = /ao\s*vivo/i.test(mh);
  let status = 'scheduled';
  if (started) {
    if (hasLiveText) {
      status = 'live';
    } else {
      const matchTime = new Date(datetime + (datetime.endsWith('Z') ? '' : '-03:00'));
      const minsSinceStart = (Date.now() - matchTime.getTime()) / 60000;
      status = (minsSinceStart >= -5 && minsSinceStart <= 120) ? 'live' : 'finished';
    }
  }

  let liveMinute = null;
  if (status === 'live') {
    const minMatch = timeStr.match(/(\d+)/);
    if (minMatch) liveMinute = minMatch[1];
  }

  const linkMatch = mh.match(/<a[^>]+href="([^"]*\/ao-vivo\/[^"]+)"/);
  const matchUrl = linkMatch ? linkMatch[1] : '';
  const urlIdMatch = matchUrl.match(/\/(\d+)\/?$/);
  const matchId = urlIdMatch ? urlIdMatch[1] : '';
  const isHome = isCorinthiansName(homeTeam);

  return {
    round: roundNum,
    date: rawDate,
    time: parseTime(timeStr),
    liveMinute,
    datetime,
    homeTeam,
    homeAcronym,
    awayTeam,
    awayAcronym,
    stadium,
    homeGoals,
    awayGoals,
    status,
    championship: compName,
    championshipKey: compKey,
    stage: stageLabel || `Rodada ${roundNum}`,
    homeLogo,
    awayLogo,
    matchUrl,
    matchId,
    isHome,
    opponent: isHome ? awayTeam : homeTeam,
    opponentAcronym: isHome ? awayAcronym : homeAcronym,
  };
}

function parseHtml(html, compName, compKey) {
  const matches = [];
  const seen = new Set();

  // Primary: round-structured sections
  const sections = html.split('<li class="round');
  for (let i = 1; i < sections.length; i++) {
    const s = sections[i];
    const roundIdMatch = s.match(/^[^"]*" id="round-(\d+)">/);
    const roundNum = roundIdMatch ? parseInt(roundIdMatch[1]) : i;
    const titleMatch = s.match(/<h[234][^>]*class="[^"]*round[^"]*"[^>]*>([^<]+)<\/h[234]>/);
    const stageLabel = titleMatch ? titleMatch[1].trim() : `Rodada ${roundNum}`;
    const section = roundIdMatch ? s.substring(roundIdMatch[0].length) : s;

    const matchRegex = /<li class="match[^"]*"([\s\S]*?)<\/li>/g;
    let m;
    while ((m = matchRegex.exec(section)) !== null) {
      const parsed = extractMatchFromHtmlBlock(m[0], compName, compKey, roundNum, stageLabel);
      if (parsed) {
        const key = `${parsed.date}|${normText(parsed.homeTeam)}|${normText(parsed.awayTeam)}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(parsed);
        }
      }
    }
  }

  // Fallback for knockout / phase pages without <li class="round" id="round-\d+">
  if (matches.length === 0) {
    const matchRegex = /<li class="match[^"]*"([\s\S]*?)<\/li>/g;
    let m;
    let idx = 1;
    while ((m = matchRegex.exec(html)) !== null) {
      const parsed = extractMatchFromHtmlBlock(m[0], compName, compKey, idx, 'Fase Eliminatória');
      if (parsed) {
        const key = `${parsed.date}|${normText(parsed.homeTeam)}|${normText(parsed.awayTeam)}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(parsed);
          idx++;
        }
      }
    }
  }

  return matches;
}

function parseEspnEvents(events, defaultComp) {
  if (!Array.isArray(events)) return [];
  const parsed = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const compObj = ev.competitions?.[0];
    if (!compObj) continue;

    const competitors = compObj.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home') || competitors[0];
    const away = competitors.find(c => c.homeAway === 'away') || competitors[1];
    if (!home || !away) continue;

    const homeTeamRaw = home.team?.shortDisplayName || home.team?.displayName || home.team?.name || '';
    const awayTeamRaw = away.team?.shortDisplayName || away.team?.displayName || away.team?.name || '';
    if (!isCorinthiansName(homeTeamRaw) && !isCorinthiansName(awayTeamRaw)) continue;

    const homeTeam = isCorinthiansName(homeTeamRaw) ? 'Corinthians' : homeTeamRaw;
    const awayTeam = isCorinthiansName(awayTeamRaw) ? 'Corinthians' : awayTeamRaw;

    const leagueInfo = ev.league || ev.season?.type || {};
    const comp = mapCompFromNameOrSlug(
      `${leagueInfo.name || ''} ${leagueInfo.abbreviation || ''} ${ev.name || ''}`,
      leagueInfo.slug || defaultComp?.espnSlug || ''
    ) || defaultComp;
    if (!comp) continue;

    const dt = toSaoPauloParts(ev.date || compObj.date);
    if (!dt) continue;

    const state = compObj.status?.type?.state || ev.status?.type?.state || 'pre';
    const completed = Boolean(compObj.status?.type?.completed || state === 'post');
    const isLive = state === 'in';
    const status = isLive ? 'live' : (completed ? 'finished' : 'scheduled');

    const parseScore = v => {
      if (v === undefined || v === null || v === '') return null;
      const n = typeof v === 'object' ? Number(v.value ?? v.displayValue) : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const homeGoals = (completed || isLive) ? parseScore(home.score) : null;
    const awayGoals = (completed || isLive) ? parseScore(away.score) : null;
    const clockText = compObj.status?.displayClock || '';
    const minMatch = clockText.match(/(\d+)/);
    const liveMinute = isLive && minMatch ? minMatch[1] : null;

    const isHome = homeTeam === 'Corinthians';
    const roundMatch = String(ev.week?.text || compObj.notes?.[0]?.headline || '').match(/(\d+)/);
    const round = ev.week?.number || (roundMatch ? parseInt(roundMatch[1]) : i + 1);
    const stage = ev.seasonType?.name || compObj.notes?.[0]?.headline || (comp.key === 'brasileirao' ? `Rodada ${round}` : undefined);

    parsed.push({
      round,
      date: dt.date,
      time: dt.time,
      liveMinute,
      datetime: dt.datetime,
      homeTeam,
      homeAcronym: home.team?.abbreviation || (isHome ? 'COR' : ''),
      awayTeam,
      awayAcronym: away.team?.abbreviation || (!isHome ? 'COR' : ''),
      stadium: compObj.venue?.fullName || '',
      homeGoals,
      awayGoals,
      status,
      championship: comp.name,
      championshipKey: comp.key,
      stage,
      homeLogo: isHome ? 'logocorinthians.svg' : (home.team?.logos?.[0]?.href || home.team?.logo || ''),
      awayLogo: !isHome ? 'logocorinthians.svg' : (away.team?.logos?.[0]?.href || away.team?.logo || ''),
      matchUrl: ev.links?.[0]?.href || '',
      matchId: String(ev.id || ''),
      isHome,
      opponent: isHome ? awayTeam : homeTeam,
      opponentAcronym: isHome ? (away.team?.abbreviation || '') : (home.team?.abbreviation || ''),
      source: 'espn',
    });
  }

  return parsed;
}

function matchIdentityKey(m) {
  return `${m.championshipKey}|${m.date}|${m.isHome ? 'H' : 'A'}|${normText(m.opponent)}`;
}

function mergeMatchRecord(base, incoming) {
  if (!base) return incoming;
  const merged = { ...base };

  // Prefer live or finished state over scheduled
  const rank = s => (s === 'live' ? 3 : s === 'finished' ? 2 : 1);
  if (rank(incoming.status) >= rank(base.status)) {
    merged.status = incoming.status;
    if (incoming.homeGoals !== null && incoming.homeGoals !== undefined) merged.homeGoals = incoming.homeGoals;
    if (incoming.awayGoals !== null && incoming.awayGoals !== undefined) merged.awayGoals = incoming.awayGoals;
    if (incoming.liveMinute) merged.liveMinute = incoming.liveMinute;
  }

  // Fill missing fields or prefer Terra / more complete metadata
  if (incoming.time && (!base.time || base.status === 'scheduled')) {
    merged.time = incoming.time;
    merged.datetime = incoming.datetime;
  }
  if (!merged.stadium && incoming.stadium) merged.stadium = incoming.stadium;
  if (!merged.homeLogo && incoming.homeLogo) merged.homeLogo = incoming.homeLogo;
  if (!merged.awayLogo && incoming.awayLogo) merged.awayLogo = incoming.awayLogo;
  if (!merged.matchUrl && incoming.matchUrl) merged.matchUrl = incoming.matchUrl;
  if (!merged.matchId && incoming.matchId) merged.matchId = incoming.matchId;
  if (!merged.stage && incoming.stage) merged.stage = incoming.stage;
  if (!merged.penalties && incoming.penalties) merged.penalties = incoming.penalties;
  if (!merged.notes && incoming.notes) merged.notes = incoming.notes;
  if (merged.homeTeam === 'Corinthians') merged.homeLogo = 'logocorinthians.svg';
  if (merged.awayTeam === 'Corinthians') merged.awayLogo = 'logocorinthians.svg';

  return merged;
}

function mergeMatches(existingList, newLists) {
  const map = new Map();
  const byRoundOpponent = new Map();

  for (const m of existingList) {
    const key = matchIdentityKey(m);
    map.set(key, { ...m });
    if (m.round) {
      byRoundOpponent.set(`${m.championshipKey}|R${m.round}|${normText(m.opponent)}`, key);
    }
  }

  for (const list of newLists) {
    for (const raw of list) {
      const incoming = { ...raw };
      delete incoming.source;
      let key = matchIdentityKey(incoming);
      if (!map.has(key) && incoming.round) {
        const altKey = byRoundOpponent.get(`${incoming.championshipKey}|R${incoming.round}|${normText(incoming.opponent)}`);
        if (altKey && map.has(altKey)) key = altKey;
      }
      const existing = map.get(key);
      map.set(key, mergeMatchRecord(existing, incoming));
      if (incoming.round) {
        byRoundOpponent.set(`${incoming.championshipKey}|R${incoming.round}|${normText(incoming.opponent)}`, key);
      }
    }
  }

  return [...map.values()].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

function detectPushAlerts(previousList, mergedList) {
  const alerts = [];
  const prevMap = new Map();
  for (const m of previousList || []) {
    prevMap.set(matchIdentityKey(m), m);
  }

  for (const curr of mergedList) {
    const prev = prevMap.get(matchIdentityKey(curr));
    if (!prev) continue;

    if (prev.status !== 'live' && curr.status === 'live') {
      alerts.push({
        title: '⚽ Bola rolando! Vai, Corinthians!',
        body: `${curr.championship}: ${curr.homeTeam} x ${curr.awayTeam}`,
      });
    }

    if (curr.status === 'live' || prev.status === 'live') {
      const prevH = prev.homeGoals ?? 0;
      const prevA = prev.awayGoals ?? 0;
      const currH = curr.homeGoals ?? 0;
      const currA = curr.awayGoals ?? 0;
      if (currH > prevH || currA > prevA) {
        const corScored = (curr.isHome && currH > prevH) || (!curr.isHome && currA > prevA);
        alerts.push({
          title: corScored ? 'GOOOOL DO TIMÃO! 🏴🏳️' : `Gol do ${curr.opponent}`,
          body: `${curr.homeTeam} ${currH} x ${currA} ${curr.awayTeam} (${curr.championship})`,
        });
      }
    }

    if (prev.status === 'live' && curr.status === 'finished') {
      alerts.push({
        title: '⏱️ Fim de jogo!',
        body: `${curr.homeTeam} ${curr.homeGoals ?? 0} x ${curr.awayGoals ?? 0} ${curr.awayTeam} (${curr.championship})`,
      });
    }
  }

  return alerts;
}

async function sendPushNotifications(alerts) {
  if (!alerts.length) return;

  const osKey = process.env.ONESIGNAL_REST_API_KEY;
  const osAppId = process.env.ONESIGNAL_APP_ID || '172a6b14-7206-4d67-91c6-53c684deb317';
  const ntfyTopic = process.env.NTFY_TOPIC;

  for (const alert of alerts) {
    console.log(`  [Alert] ${alert.title} -> ${alert.body}`);

    if (osKey) {
      try {
        const resp = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${osKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app_id: osAppId,
            included_segments: ['Subscribed Users'],
            headings: { en: alert.title, pt: alert.title },
            contents: { en: alert.body, pt: alert.body },
          }),
          signal: AbortSignal.timeout(8000),
        });
        console.log(`    [OneSignal] HTTP ${resp.status}`);
      } catch (err) {
        console.log(`    [OneSignal] ERROR: ${err.message}`);
      }
    }

    if (ntfyTopic) {
      try {
        const resp = await fetch('https://ntfy.sh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: ntfyTopic,
            title: alert.title,
            message: alert.body,
            priority: 4,
            tags: ['soccer', 'corinthians'],
          }),
          signal: AbortSignal.timeout(8000),
        });
        console.log(`    [ntfy] HTTP ${resp.status}`);
      } catch (err) {
        console.log(`    [ntfy] ERROR: ${err.message}`);
      }
    }
  }
}

async function scrape() {
  let previousData = { corinthiansMatches: [], standings: [], lineups: {}, competitionsMeta: [] };
  if (existsSync('matches.json')) {
    try {
      previousData = JSON.parse(readFileSync('matches.json', 'utf8'));
    } catch (err) {
      console.log('Warning: could not parse existing matches.json:', err.message);
    }
  }

  const terraMatches = [];
  const espnMatches = [];
  const standingsByKey = new Map();
  for (const s of previousData.standings || []) {
    standingsByKey.set(s.championshipKey, s);
  }
  const errors = [];

  // 1. Fetch Terra Esportes (HTML)
  for (const comp of COMPETITIONS) {
    try {
      const html = await fetchText(BASE_URL.replace('ID', comp.id));
      const matches = parseHtml(html, comp.name, comp.key);
      terraMatches.push(...matches);
      console.log(`  [Terra] ${comp.name}: ${matches.length} Corinthians matches`);
    } catch (err) {
      errors.push(`[Terra] ${comp.name}: ${err.message}`);
      console.log(`  [Terra] ${comp.name}: ERROR - ${err.message}`);
    }

    try {
      const html = await fetchText(STANDINGS_URL.replace('ID', comp.id));
      const parsed = parseStandings(html, comp.name, comp.key);
      if (parsed) {
        standingsByKey.set(comp.key, parsed);
        console.log(`  [Terra] ${comp.name}: ${parsed.teams.length} teams in standings`);
      }
    } catch (err) {
      errors.push(`[Terra Standings] ${comp.name}: ${err.message}`);
      console.log(`  [Terra Standings] ${comp.name}: ERROR - ${err.message}`);
    }
  }

  // 2. Fetch ESPN Public API (all competitions + per-league fallback)
  try {
    const allSchedule = await fetchJson(ESPN_WEB_ALL_SCHEDULE_URL);
    const parsedAll = parseEspnEvents(allSchedule?.events || [], null);
    espnMatches.push(...parsedAll);
    console.log(`  [ESPN/all] ${parsedAll.length} Corinthians matches`);
  } catch (err) {
    errors.push(`[ESPN/all]: ${err.message}`);
    console.log(`  [ESPN/all]: ERROR - ${err.message}`);
  }

  for (const comp of COMPETITIONS) {
    if (!comp.espnSlug) continue;
    try {
      const data = await fetchJson(ESPN_TEAM_SCHEDULE_URL.replace('{league}', comp.espnSlug));
      const parsed = parseEspnEvents(data?.events || [], comp);
      espnMatches.push(...parsed);
      console.log(`  [ESPN] ${comp.name}: ${parsed.length} Corinthians matches`);
    } catch (err) {
      errors.push(`[ESPN] ${comp.name}: ${err.message}`);
      console.log(`  [ESPN] ${comp.name}: ERROR - ${err.message}`);
    }

    if (comp.key === 'brasileirao') {
      try {
        const stJson = await fetchJson(ESPN_STANDINGS_URL.replace('{league}', comp.espnSlug));
        const stParsed = parseEspnStandings(stJson, comp);
        if (stParsed && !terraMatches.length) {
          standingsByKey.set(comp.key, stParsed);
          console.log(`  [ESPN Standings] ${comp.name}: ${stParsed.teams.length} teams`);
        }
      } catch (err) {
        errors.push(`[ESPN Standings] ${comp.name}: ${err.message}`);
      }
    }
  }

  // 3. Smart merge preserving full season history
  const mergedMatches = mergeMatches(previousData.corinthiansMatches || [], [espnMatches, terraMatches]);

  // 4. Fetch lineups for live/finished/imminent Terra matches
  const lineups = { ...(previousData.lineups || {}) };
  const lineupTargets = mergedMatches.filter(m => {
    if (!m.matchId || !m.matchUrl || !m.matchUrl.includes('terra.com.br')) return false;
    if (m.status === 'live') return true;
    if (m.status !== 'scheduled' && !lineups[m.matchId]) return true;
    const matchTime = new Date(m.datetime + (m.datetime.endsWith('Z') ? '' : '-03:00'));
    const diffH = (matchTime - new Date()) / 3600000;
    return diffH <= 3 && diffH >= -1;
  });

  for (const m of lineupTargets) {
    try {
      const html = await fetchText(m.matchUrl);
      const data = parseLineupPlayers(html);
      if (data) lineups[m.matchId] = data;
    } catch (err) {
      console.log(`  Lineup ERROR (${m.matchId}): ${err.message}`);
    }
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    season: previousData.season || new Date().getFullYear(),
    competitionsMeta: previousData.competitionsMeta || [],
    corinthiansMatches: mergedMatches,
    standings: [...standingsByKey.values()],
    lineups,
  };

  writeFileSync('matches.json', JSON.stringify(output, null, 2));

  const alerts = detectPushAlerts(previousData.corinthiansMatches || [], mergedMatches);
  await sendPushNotifications(alerts);

  const upcoming = mergedMatches.filter(m => m.status === 'scheduled').length;
  const liveCount = mergedMatches.filter(m => m.status === 'live').length;
  console.log(`\nTotal: ${mergedMatches.length} Corinthians matches (${upcoming} upcoming, ${liveCount} live)`);
  if (errors.length) console.log(`Errors (${errors.length}): ${errors.slice(0, 5).join(' | ')}`);
}

scrape().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
