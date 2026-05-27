import { writeFileSync } from 'fs';

const URL = 'https://p1.trrsf.com/api/musa-soccer/ms-standings-games-light?idChampionship=1456&idPhase=&language=pt-BR&country=BR&nav=N&timezone=BR';

function parseTime(timeStr) {
  const m = timeStr.match(/(\d{1,2})h(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function fmtDate(dateStr, timeStr) {
  const t = parseTime(timeStr);
  return t ? `${dateStr}T${t}:00` : `${dateStr}T00:00:00`;
}

async function scrape() {
  const resp = await fetch(URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();

  const rounds = [];
  const corinthiansMatches = [];

  const ROUND_START = '<li class="round';
  const sections = html.split(ROUND_START);
  for (let i = 1; i < sections.length; i++) {
    const s = sections[i];
    const idMatch = s.match(/^[^"]*" id="round-(\d+)">/);
    if (!idMatch) continue;

    const roundNum = parseInt(idMatch[1]);
    const section = s.substring(idMatch[0].length);
    const roundMatches = [];

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

      let championship = 'Brasileirão Série A';

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
        championship
      };

      roundMatches.push(matchData);

      if (homeTeam === 'Corinthians' || awayTeam === 'Corinthians') {
        corinthiansMatches.push({
          ...matchData,
          isHome: homeTeam === 'Corinthians',
          opponent: homeTeam === 'Corinthians' ? awayTeam : homeTeam,
          opponentAcronym: homeTeam === 'Corinthians' ? awayAcronym : homeAcronym
        });
      }
    }

    if (roundMatches.length > 0) {
      rounds.push({ round: roundNum, matches: roundMatches });
    }
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    rounds,
    corinthiansMatches
  };

  writeFileSync('matches.json', JSON.stringify(output, null, 2));
  const upcoming = corinthiansMatches.filter(m => m.status === 'scheduled').length;
  console.log(`OK — ${rounds.length} rounds, ${corinthiansMatches.length} Corinthians matches (${upcoming} upcoming), saved to matches.json`);
}

scrape().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
