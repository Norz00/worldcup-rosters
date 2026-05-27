/**
 * 2026 World Cup Roster Scraper
 *
 * Primary: Wikipedia raw wikitext API (most reliable free source)
 * Fallback: Custom JSON API (ROSTER_SOURCE_URL env var)
 *
 * GitHub Actions runs this daily. No local network restrictions on GH servers.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'rosters.json');

// ---- Team name mapping (English -> Chinese + group) ----
const TEAMS = {
  'mexico':               { cn: '墨西哥', en: 'Mexico', group: 'A' },
  'south africa':         { cn: '南非', en: 'South Africa', group: 'A' },
  'south korea':          { cn: '韩国', en: 'South Korea', group: 'A' },
  'korea republic':       { cn: '韩国', en: 'South Korea', group: 'A' },
  'czech republic':       { cn: '捷克', en: 'Czechia', group: 'A' },
  'czechia':              { cn: '捷克', en: 'Czechia', group: 'A' },
  'canada':               { cn: '加拿大', en: 'Canada', group: 'B' },
  'bosnia':               { cn: '波黑', en: 'Bosnia and Herzegovina', group: 'B' },
  'bosnia and herzegovina': { cn: '波黑', en: 'Bosnia and Herzegovina', group: 'B' },
  'qatar':                { cn: '卡塔尔', en: 'Qatar', group: 'B' },
  'switzerland':          { cn: '瑞士', en: 'Switzerland', group: 'B' },
  'brazil':               { cn: '巴西', en: 'Brazil', group: 'C' },
  'morocco':              { cn: '摩洛哥', en: 'Morocco', group: 'C' },
  'haiti':                { cn: '海地', en: 'Haiti', group: 'C' },
  'scotland':             { cn: '苏格兰', en: 'Scotland', group: 'C' },
  'united states':        { cn: '美国', en: 'United States', group: 'D' },
  'usa':                  { cn: '美国', en: 'United States', group: 'D' },
  'paraguay':             { cn: '巴拉圭', en: 'Paraguay', group: 'D' },
  'australia':            { cn: '澳大利亚', en: 'Australia', group: 'D' },
  'turkey':               { cn: '土耳其', en: 'Turkiye', group: 'D' },
  'turkiye':              { cn: '土耳其', en: 'Turkiye', group: 'D' },
  'germany':              { cn: '德国', en: 'Germany', group: 'E' },
  'ecuador':              { cn: '厄瓜多尔', en: 'Ecuador', group: 'E' },
  'ivory coast':          { cn: '科特迪瓦', en: 'Ivory Coast', group: 'E' },
  "cote d'ivoire":        { cn: '科特迪瓦', en: 'Ivory Coast', group: 'E' },
  'curacao':              { cn: '库拉索', en: 'Curacao', group: 'E' },
  'curaçao':              { cn: '库拉索', en: 'Curacao', group: 'E' },
  'netherlands':          { cn: '荷兰', en: 'Netherlands', group: 'F' },
  'japan':                { cn: '日本', en: 'Japan', group: 'F' },
  'sweden':               { cn: '瑞典', en: 'Sweden', group: 'F' },
  'tunisia':              { cn: '突尼斯', en: 'Tunisia', group: 'F' },
  'belgium':              { cn: '比利时', en: 'Belgium', group: 'G' },
  'egypt':                { cn: '埃及', en: 'Egypt', group: 'G' },
  'iran':                 { cn: '伊朗', en: 'Iran', group: 'G' },
  'new zealand':          { cn: '新西兰', en: 'New Zealand', group: 'G' },
  'spain':                { cn: '西班牙', en: 'Spain', group: 'H' },
  'uruguay':              { cn: '乌拉圭', en: 'Uruguay', group: 'H' },
  'saudi arabia':         { cn: '沙特阿拉伯', en: 'Saudi Arabia', group: 'H' },
  'cape verde':           { cn: '佛得角', en: 'Cape Verde', group: 'H' },
  'france':               { cn: '法国', en: 'France', group: 'I' },
  'senegal':              { cn: '塞内加尔', en: 'Senegal', group: 'I' },
  'norway':               { cn: '挪威', en: 'Norway', group: 'I' },
  'iraq':                 { cn: '伊拉克', en: 'Iraq', group: 'I' },
  'argentina':            { cn: '阿根廷', en: 'Argentina', group: 'J' },
  'algeria':              { cn: '阿尔及利亚', en: 'Algeria', group: 'J' },
  'austria':              { cn: '奥地利', en: 'Austria', group: 'J' },
  'jordan':               { cn: '约旦', en: 'Jordan', group: 'J' },
  'portugal':             { cn: '葡萄牙', en: 'Portugal', group: 'K' },
  'colombia':             { cn: '哥伦比亚', en: 'Colombia', group: 'K' },
  'uzbekistan':           { cn: '乌兹别克斯坦', en: 'Uzbekistan', group: 'K' },
  'dr congo':             { cn: '刚果民主共和国', en: 'DR Congo', group: 'K' },
  'england':              { cn: '英格兰', en: 'England', group: 'L' },
  'croatia':              { cn: '克罗地亚', en: 'Croatia', group: 'L' },
  'panama':               { cn: '巴拿马', en: 'Panama', group: 'L' },
  'ghana':                { cn: '加纳', en: 'Ghana', group: 'L' },
};

// ---- Helpers ----

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'WorldCupRosterBot/1.0 (GitHub Actions)' },
      timeout: 20000,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function matchTeam(name) {
  const lower = name.toLowerCase().trim();
  if (TEAMS[lower]) return TEAMS[lower];
  for (const [key, val] of Object.entries(TEAMS)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  return null;
}

function stripWiki(text) {
  return text
    .replace(/\[\[([^\]|]+)\]\]/g, '$1')
    .replace(/\[\[[^\]]*\|([^\]]*)\]\]/g, '$1')
    .replace(/'''(.*?)'''/g, '$1')
    .replace(/''(.*?)''/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ---- Wikipedia Scraper ----

async function scrapeWikipedia() {
  console.log('Fetching Wikipedia raw wikitext...');

  // Get raw wiki markup for "2026 FIFA World Cup squads" page
  const url = 'https://en.wikipedia.org/w/index.php?title=2026_FIFA_World_Cup_squads&action=raw';
  const raw = await httpGet(url);

  if (!raw || raw.length < 1000) {
    throw new Error('Wikipedia page returned empty or too short');
  }

  console.log(`Got ${raw.length} chars of wikitext`);

  // Parse wiki markup
  const teams = [];

  // Find squad sections: typically === {{flagicon|COUNTRY}} [[COUNTRY]] ===
  const sectionRegex = /={2,3}\s*(?:{{[^}]+}})?\s*(?:\[\[)?([^\]}=|]+)(?:\]\])?\s*={2,3}\s*[\s\S]*?(?=={2,3}\s*(?:{{[^}]+}})?\s*(?:\[\[)?[^\]}=|]+(?:\]\])?\s*={2,3}|$)/g;

  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(raw)) !== null) {
    const sectionTitle = sectionMatch[1].trim();
    const sectionContent = sectionMatch[0];

    const info = matchTeam(sectionTitle);
    if (!info) continue;

    console.log(`  Found section: ${sectionTitle} -> ${info.cn}`);

    // Parse players from this section
    const players = [];

    // Wiki squad template format:
    // {{nat fs player|no=1|pos=GK|name=[[Player]]|club=[[Club]]}}
    // {{nat fs player|no= |pos= |name= |club= }}
    const playerRegex = /\{\{(?:nat|fs)[ _](?:fs|squad)[ _]player\s*\|([^}]+)\}\}/gi;
    let playerMatch;
    while ((playerMatch = playerRegex.exec(sectionContent)) !== null) {
      const params = playerMatch[1];

      const getParam = (key) => {
        const re = new RegExp(`\\b${key}\\s*=\\s*([^|}]*)`, 'i');
        const m = params.match(re);
        return m ? stripWiki(m[1].trim()) : '';
      };

      const num = parseInt(getParam('no'), 10) || undefined;
      const pos = getParam('pos');
      const name = getParam('name');
      const club = getParam('club');

      if (name) {
        players.push({
          number: num,
          name,
          position: pos || '未知',
          club: club || '未知',
        });
      }
    }

    // Also try standard wiki table format: {| class="wikitable"
    if (players.length === 0) {
      // Parse tables manually from raw wikitext
      const tableRegex = /\{\|\s*class="wikitable"[\s\S]*?\|\}/g;
      // ... skip for now, template format is more common
    }

    if (players.length > 0) {
      console.log(`    ${players.length} players found`);

      // Find coach
      const coachMatch = sectionContent.match(/(?:Head coach|Manager|Coach)[^=]*?(?:\[\[)?([^\]|}\n]+)/i);
      const coach = coachMatch ? stripWiki(coachMatch[1]) : undefined;

      teams.push({
        name: info.cn,
        name_en: info.en,
        coach,
        status: 'announced',
        players: players.map((p, i) => ({
          number: p.number || i + 1,
          name: p.name,
          position: p.position,
          club: p.club,
        })),
        expected_date: undefined,
      });
    }
  }

  return teams;
}

// ---- Main ----

async function main() {
  console.log(`=== Roster Update: ${new Date().toISOString()} ===\n`);

  let newTeams = null;

  // 1. Try custom API first
  const sourceUrl = process.env.ROSTER_SOURCE_URL;
  if (sourceUrl) {
    console.log(`[1] Source URL: ${sourceUrl}`);
    try {
      const raw = await httpGet(sourceUrl);
      const data = JSON.parse(raw);
      if (data.teams && Array.isArray(data.teams)) {
        newTeams = data.teams;
        console.log(`    Got ${newTeams.filter(t => t.status === 'announced').length} teams`);
      }
    } catch (e) {
      console.log(`    Failed: ${e.message}`);
    }
  }

  // 2. Wikipedia
  if (!newTeams) {
    console.log('[2] Wikipedia scraper...');
    try {
      newTeams = await scrapeWikipedia();
      console.log(`    Got ${newTeams.filter(t => t.status === 'announced').length} teams with players`);
    } catch (e) {
      console.log(`    Failed: ${e.message}`);
    }
  }

  // 3. Load existing + merge
  const existing = (() => {
    try { return JSON.parse(fs.readFileSync(OUTPUT, 'utf-8')); }
    catch { return null; }
  })();

  if (!newTeams || newTeams.length === 0) {
    console.log('\n⚠️  No new data. Keeping existing file.');
    if (existing) console.log(`    Existing: ${existing.teams.filter(t => t.status === 'announced').length} announced`);
    return;
  }

  // Merge: keep existing announced teams not in scrape
  const scrapedNames = new Set(newTeams.map(t => t.name_en.toLowerCase()));
  const existingTeams = existing?.teams || [];
  for (const t of existingTeams) {
    if (t.status === 'announced' && t.players && t.players.length > 0) {
      if (!scrapedNames.has(t.name_en.toLowerCase())) {
        newTeams.push(t);
      }
    }
  }

  // Ensure all 48 teams
  const present = new Set(newTeams.map(t => t.name_en.toLowerCase()));
  for (const [_, info] of Object.entries(TEAMS)) {
    if (!present.has(info.en.toLowerCase())) {
      // Check not already present by cn name
      if (!newTeams.find(t => t.name === info.cn)) {
        newTeams.push({
          name: info.cn, name_en: info.en,
          status: 'pending', players: [],
        });
      }
    }
  }

  const result = {
    last_updated: new Date().toISOString().split('T')[0],
    teams: newTeams,
    update_schedule: existing?.update_schedule || {},
  };

  const oldJson = existing ? JSON.stringify(existing, null, 2) : '';
  const newJson = JSON.stringify(result, null, 2);

  if (oldJson === newJson) {
    console.log('\n    No changes detected');
  } else {
    fs.writeFileSync(OUTPUT, newJson, 'utf-8');
    const announced = newTeams.filter(t => t.status === 'announced').length;
    console.log(`\n✅ Updated: ${announced}/48 teams announced`);
  }
}

main().catch(e => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
