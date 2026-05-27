import { writeFileSync } from 'fs';

const COMPETITIONS = [
  { id: 1456, name: 'Brasileirão Série A', key: 'brasileirao' },
  { id: 1457, name: 'Copa Libertadores', key: 'libertadores' },
  { id: 1459, name: 'Copa do Brasil', key: 'copabrasil' },
  { id: 1460, name: 'Copa Sudamericana', key: 'sudamericana' },
];

const BASE_URL = 'https://p1.trrsf.com/api/musa-soccer/ms-standings-games-light?idChampionship=ID&idPhase=&language=pt-BR&country=BR&nav=N&timezone=BR';

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

function parseHtml(html, compName, compKey) {
  const matches = [];

  const sections = html.split('<li class="round');
  for (let i = 1; i < sections.length; i++) {
    const s = sections[i];
    const idMatch = s.match(/^[^"]*" id="round-(\d+)">/);
    if (!idMatch) continue;

    const roundNum = parseInt(idMatch[1]);
    const section = s.substring(idMatch[0].length);

    const matchRegex = /<li class="match "([\s\S]*?)<\/li>/g;
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

      const homeGoalsMatch = mh.match(/<strong class="goals home">(\d+)<\/strong>/);
      const awayGoalsMatch = mh.match(/<strong class="goals away">(\d+)<\/strong>/);
      const homeGoals = homeGoalsMatch ? parseInt(homeGoalsMatch[1]) : null;
      const awayGoals = awayGoalsMatch ? parseInt(awayGoalsMatch[1]) : null;

      const started = homeGoals !== null;
      const status = started ? (homeGoals !== awayGoals ? 'finished' : 'draw') : 'scheduled';

      const matchData = {
        round: roundNum,
        date: rawDate,
        time: parseTime(timeStr),
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
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    corinthiansMatches: allCorinthians,
  };

  writeFileSync('matches.json', JSON.stringify(output, null, 2));
  const upcoming = allCorinthians.filter(m => m.status === 'scheduled').length;
  console.log(`\nTotal: ${allCorinthians.length} Corinthians matches (${upcoming} upcoming)`);
  if (errors.length) console.log(`Errors: ${errors.join(' | ')}`);
}

scrape().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
