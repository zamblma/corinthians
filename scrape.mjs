import { writeFileSync } from 'fs';

const COMPETITIONS = [
  { id: 1456, name: 'Brasileirão Série A', key: 'brasileirao' },
  { id: 1457, name: 'Copa Libertadores', key: 'libertadores' },
  { id: 1459, name: 'Copa do Brasil', key: 'copabrasil' },
  { id: 1460, name: 'Copa Sudamericana', key: 'sudamericana' },
  { id: 1455, name: 'Campeonato Paulista', key: 'paulista' },
];

const BASE_URL = 'https://p1.trrsf.com/api/musa-soccer/ms-standings-games-light?idChampionship=ID&idPhase=&language=pt-BR&country=BR&nav=N&timezone=BR';
const STANDINGS_URL = 'https://p1.trrsf.com/api/musa-soccer/ms-standings-light?idChampionship=ID&language=pt-BR&country=BR&nav=N&timezone=BR';

function parseTime(timeStr) {
  const m = timeStr.match(/(\d{1,2})h(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function fmtDate(dateStr, timeStr) {
  const t = parseTime(timeStr);
  return t ? `${dateStr}T${t}:00` : `${dateStr}T00:00:00`;
}

async function fetchCompetition(comp) {
  const url = BASE_URL.replace('ID', comp.id);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${comp.name}`);
  return await resp.text();
}

function parseStandings(html, compName, compKey) {
  if (compKey === 'copabrasil' || compKey === 'paulista') return null; // knockout/state format, no league table

  const rows = html.match(/<tr[^>]*data-idteam="[^"]*"[^>]*>[\s\S]*?<\/tr>/g);
  if (!rows) return null;

  const teams = [];

  for (const row of rows) {
    const posMatch = row.match(/<td class="main position[^"]*"[^>]*>(\d+)<\/td>/);
    const nameMatch = row.match(/<td class="main team-name[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)/);
    const shieldMatch = row.match(/<img[^>]+class="sports-shield"[^>]+src="([^"]+)"/);
    const pointsMatch = row.match(/<td class="points[^"]*"[^>]*>(\d+)<\/td>/);
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

    teams.push({
      pos: parseInt(posMatch[1]),
      name: nameMatch[1].trim(),
      shield: shieldMatch ? shieldMatch[1] : '',
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

  return { championship: compName, championshipKey: compKey, teams };
}

async function fetchStandings(comp) {
  const url = STANDINGS_URL.replace('ID', comp.id);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${comp.name}`);
  return await resp.text();
}

async function fetchLineupPage(matchUrl) {
  if (!matchUrl) return null;
  const resp = await fetch(matchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  if (!resp.ok) return null;
  return await resp.text();
}

function parseLineupPlayers(html) {
  if (!html) return null;
  const lineups = [];

  // Find each team's lineup section
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

    if (players.length > 0) {
      lineups.push({ team: teamName, acronym, players });
    }
  }

  return lineups.length > 0 ? lineups : null;
}
function parseHtml(html, compName, compKey) {
  const matches = [];

  const sections = html.split('<li class="round');
  for (let i = 1; i < sections.length; i++) {
    const s = sections[i];
    const roundIdMatch = s.match(/^[^"]*" id="round-(\d+)">/);
    if (!roundIdMatch) continue;

    const roundNum = parseInt(roundIdMatch[1]);
    const section = s.substring(roundIdMatch[0].length);

    const matchRegex = /<li class="match[^"]*"([\s\S]*?)<\/li>/g;
    let m;

    while ((m = matchRegex.exec(section)) !== null) {
      const mh = m[0];

      const nameMatch = mh.match(/<meta itemprop="name" content="([^"]+)"\s*>/);
      if (!nameMatch) continue;
      const nameParts = nameMatch[1].split(' x ');
      if (nameParts.length !== 2) continue;
      const [homeTeam, awayTeam] = nameParts;

      const dateMatch = mh.match(/<meta itemprop="startDate" content="([^"]+)"\s*>/);
      if (!dateMatch) continue;
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
      const homeLogo = shields.length > 0 ? shields[0][1] : '';
      const awayLogo = shields.length > 1 ? shields[1][1] : '';

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
          if (minsSinceStart >= -5 && minsSinceStart <= 120) status = 'live';
          else status = 'finished';
        }
      }

      // For live matches, extract elapsed time from the time element (e.g. "38'", "42' 2T")
      let liveMinute = null;
      if (status === 'live') {
        const minMatch = timeStr.match(/(\d+)/);
        if (minMatch) liveMinute = minMatch[1];
      }

      const linkMatch = mh.match(/<a[^>]+href="([^"]*\/ao-vivo\/[^"]+)"/);
      const matchUrl = linkMatch ? linkMatch[1] : '';
      const urlIdMatch = matchUrl.match(/\/(\d+)$/);
      const matchId = urlIdMatch ? urlIdMatch[1] : '';

      const matchData = {
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
        homeLogo,
        awayLogo,
        matchUrl,
        matchId,
      };

      if (homeTeam === 'Corinthians' || awayTeam === 'Corinthians') {
        matches.push({
          ...matchData,
          isHome: homeTeam === 'Corinthians',
          opponent: homeTeam === 'Corinthians' ? awayTeam : homeTeam,
          opponentAcronym: homeTeam === 'Corinthians' ? awayAcronym : homeAcronym,
        });
      }
    }
  }

  return matches;
}

async function scrape() {
  const allCorinthians = [];
  const standingsList = [];
  const errors = [];

  for (const comp of COMPETITIONS) {
    try {
      const html = await fetchCompetition(comp);
      const matches = parseHtml(html, comp.name, comp.key);
      allCorinthians.push(...matches);
      console.log(`  ${comp.name}: ${matches.length} Corinthians matches`);
    } catch (err) {
      errors.push(`${comp.name}: ${err.message}`);
      console.log(`  ${comp.name}: ERROR - ${err.message}`);
    }

    try {
      const html = await fetchStandings(comp);
      const parsed = parseStandings(html, comp.name, comp.key);
      if (parsed) {
        standingsList.push(parsed);
        console.log(`  ${comp.name}: ${parsed.teams.length} teams in standings`);
      } else {
        console.log(`  ${comp.name}: no standings (knockout format)`);
      }
    } catch (err) {
      errors.push(`${comp.name} (standings): ${err.message}`);
      console.log(`  ${comp.name} (standings): ERROR - ${err.message}`);
    }
  }

  // Fetch lineups for finished OR upcoming matches (check if data is available)
  const lineups = {};
  const lineupTargets = allCorinthians.filter(m => {
    if (m.status === 'live') return true;
    if (m.status !== 'scheduled') return true;
    // Also try matches happening today (within 3h of kickoff)
    const matchTime = new Date(m.datetime + (m.datetime.endsWith('Z') ? '' : '-03:00'));
    const now = new Date();
    const diffH = (matchTime - now) / 3600000;
    return diffH <= 3 && diffH >= -1;
  });
  for (const m of lineupTargets) {
    try {
      if (!m.matchId) continue;
      console.log(`  Lineup: ${m.homeTeam} x ${m.awayTeam}...`);
      const html = await fetchLineupPage(m.matchUrl);
      const data = parseLineupPlayers(html);
      if (data) {
        lineups[m.matchId] = data;
        console.log(`    -> ${data[0].players.length} + ${data[1]?.players.length || 0} players`);
      } else {
        console.log(`    -> no lineup data yet`);
      }
    } catch (err) {
      console.log(`  Lineup ERROR: ${err.message}`);
    }
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    corinthiansMatches: allCorinthians,
    standings: standingsList,
    lineups,
  };

  writeFileSync('matches.json', JSON.stringify(output, null, 2));
  const upcoming = allCorinthians.filter(m => m.status === 'scheduled').length;
  const liveCount = allCorinthians.filter(m => m.status === 'live').length;
  console.log(`\nTotal: ${allCorinthians.length} Corinthians matches (${upcoming} upcoming, ${liveCount} live)`);
  if (errors.length) console.log(`Errors: ${errors.join(' | ')}`);
}

scrape().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
