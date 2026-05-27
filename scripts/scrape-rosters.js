/**
 * 2026 World Cup Roster Auto-Updater
 *
 * Strategy:
 *   1. If ROSTER_SOURCE_URL is set, fetch from that URL (supports JSON)
 *   2. Otherwise, try Wikipedia API for squad data
 *   3. Merge with existing data (don't lose previously scraped info)
 *   4. Write updated rosters.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'rosters.json');

// ---- CONFIG: Map English team names to our internal names ----
const NAME_MAP = {
  'mexico':              { cn: '墨西哥', en: 'Mexico', group: 'A' },
  'south africa':        { cn: '南非', en: 'South Africa', group: 'A' },
  'south korea':         { cn: '韩国', en: 'South Korea', group: 'A' },
  'czech republic':      { cn: '捷克', en: 'Czechia', group: 'A' },
  'czechia':             { cn: '捷克', en: 'Czechia', group: 'A' },
  'canada':              { cn: '加拿大', en: 'Canada', group: 'B' },
  'bosnia':              { cn: '波黑', en: 'Bosnia and Herzegovina', group: 'B' },
  'bosnia and herzegovina': { cn: '波黑', en: 'Bosnia and Herzegovina', group: 'B' },
  'qatar':               { cn: '卡塔尔', en: 'Qatar', group: 'B' },
  'switzerland':         { cn: '瑞士', en: 'Switzerland', group: 'B' },
  'brazil':              { cn: '巴西', en: 'Brazil', group: 'C' },
  'morocco':             { cn: '摩洛哥', en: 'Morocco', group: 'C' },
  'haiti':               { cn: '海地', en: 'Haiti', group: 'C' },
  'scotland':            { cn: '苏格兰', en: 'Scotland', group: 'C' },
  'united states':       { cn: '美国', en: 'United States', group: 'D' },
  'usa':                 { cn: '美国', en: 'United States', group: 'D' },
  'paraguay':            { cn: '巴拉圭', en: 'Paraguay', group: 'D' },
  'australia':           { cn: '澳大利亚', en: 'Australia', group: 'D' },
  'turkey':              { cn: '土耳其', en: 'Turkiye', group: 'D' },
  'turkiye':             { cn: '土耳其', en: 'Turkiye', group: 'D' },
  'germany':             { cn: '德国', en: 'Germany', group: 'E' },
  'ecuador':             { cn: '厄瓜多尔', en: 'Ecuador', group: 'E' },
  'ivory coast':         { cn: '科特迪瓦', en: 'Ivory Coast', group: 'E' },
  "côte d'ivoire":       { cn: '科特迪瓦', en: 'Ivory Coast', group: 'E' },
  'curacao':             { cn: '库拉索', en: 'Curacao', group: 'E' },
  'curaçao':             { cn: '库拉索', en: 'Curacao', group: 'E' },
  'netherlands':         { cn: '荷兰', en: 'Netherlands', group: 'F' },
  'japan':               { cn: '日本', en: 'Japan', group: 'F' },
  'sweden':              { cn: '瑞典', en: 'Sweden', group: 'F' },
  'tunisia':             { cn: '突尼斯', en: 'Tunisia', group: 'F' },
  'belgium':             { cn: '比利时', en: 'Belgium', group: 'G' },
  'egypt':               { cn: '埃及', en: 'Egypt', group: 'G' },
  'iran':                { cn: '伊朗', en: 'Iran', group: 'G' },
  'new zealand':         { cn: '新西兰', en: 'New Zealand', group: 'G' },
  'spain':               { cn: '西班牙', en: 'Spain', group: 'H' },
  'uruguay':             { cn: '乌拉圭', en: 'Uruguay', group: 'H' },
  'saudi arabia':        { cn: '沙特阿拉伯', en: 'Saudi Arabia', group: 'H' },
  'cape verde':          { cn: '佛得角', en: 'Cape Verde', group: 'H' },
  'france':              { cn: '法国', en: 'France', group: 'I' },
  'senegal':             { cn: '塞内加尔', en: 'Senegal', group: 'I' },
  'norway':              { cn: '挪威', en: 'Norway', group: 'I' },
  'iraq':                { cn: '伊拉克', en: 'Iraq', group: 'I' },
  'argentina':           { cn: '阿根廷', en: 'Argentina', group: 'J' },
  'algeria':             { cn: '阿尔及利亚', en: 'Algeria', group: 'J' },
  'austria':             { cn: '奥地利', en: 'Austria', group: 'J' },
  'jordan':              { cn: '约旦', en: 'Jordan', group: 'J' },
  'portugal':            { cn: '葡萄牙', en: 'Portugal', group: 'K' },
  'colombia':            { cn: '哥伦比亚', en: 'Colombia', group: 'K' },
  'uzbekistan':          { cn: '乌兹别克斯坦', en: 'Uzbekistan', group: 'K' },
  'dr congo':            { cn: '刚果民主共和国', en: 'DR Congo', group: 'K' },
  'england':             { cn: '英格兰', en: 'England', group: 'L' },
  'croatia':             { cn: '克罗地亚', en: 'Croatia', group: 'L' },
  'panama':              { cn: '巴拿马', en: 'Panama', group: 'L' },
  'ghana':               { cn: '加纳', en: 'Ghana', group: 'L' },
};

// Internal URL template: GitHub raw URL for rosters.json in this repo
function getRepoRawUrl() {
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  const ref = process.env.GITHUB_REF_NAME || 'main';
  if (repo) {
    return `https://raw.githubusercontent.com/${repo}/${ref}/rosters.json`;
  }
  return null;
}

// ---- HTTP Helpers ----

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: opts.timeout || 15000,
    };
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, opts).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ---- Main ----

async function main() {
  const startTime = new Date().toISOString();
  console.log(`=== Roster Update: ${startTime} ===\n`);

  let newTeams = null;

  // Step 1: Try manual source URL (if configured in repo secrets/vars)
  const sourceUrl = process.env.ROSTER_SOURCE_URL;
  if (sourceUrl) {
    console.log(`[1] Trying source URL: ${sourceUrl}`);
    try {
      const raw = await fetch(sourceUrl);
      const parsed = parseAnyFormat(raw);
      if (parsed) {
        newTeams = parsed;
        console.log(`    Got ${newTeams.filter(t => t.status === 'announced').length} announced teams`);
      }
    } catch (e) {
      console.log(`    Failed: ${e.message}`);
    }
  }

  // Step 2: Try Wikipedia API
  if (!newTeams) {
    console.log('[2] Trying Wikipedia API...');
    try {
      newTeams = await fetchWikipediaSquads();
      console.log(`    Got ${newTeams.filter(t => t.status === 'announced').length} announced teams`);
    } catch (e) {
      console.log(`    Failed: ${e.message}`);
    }
  }

  // Step 3: Load existing data, merge
  const existing = loadExistingJson();
  const existingTeams = existing?.teams || [];

  if (!newTeams || newTeams.length === 0) {
    console.log('\n⚠️  Could not fetch new data. Keeping existing file.');
    if (existing && existing.teams) {
      console.log(`    Existing: ${existing.teams.filter(t => t.status === 'announced').length} announced`);
    }
    return;
  }

  // Merge: keep existing announced teams if scraper missed them
  const mergedTeams = [];
  const scraperNames = new Set(newTeams.map(t => t.name_en.toLowerCase()));

  // Add scraper results
  for (const t of newTeams) {
    mergedTeams.push(t);
  }

  // Add existing announced teams that scraper didn't find
  for (const t of existingTeams) {
    if (t.status === 'announced' && !scraperNames.has(t.name_en.toLowerCase())) {
      console.log(`    Preserving: ${t.name} (not in scrape)`);
      mergedTeams.push(t);
    }
  }

  // Ensure all 48 teams exist
  const mergedNames = new Set(mergedTeams.map(t => t.name_en.toLowerCase()));
  for (const [_, info] of Object.entries(NAME_MAP)) {
    if (!mergedNames.has(info.en.toLowerCase())) {
      mergedTeams.push({
        name: info.cn,
        name_en: info.en,
        coach: undefined,
        status: 'pending',
        players: [],
        expected_date: undefined,
      });
    }
  }

  const result = {
    last_updated: new Date().toISOString().split('T')[0],
    teams: mergedTeams,
    update_schedule: existing?.update_schedule || {},
  };

  const announcedCount = mergedTeams.filter(t => t.status === 'announced').length;
  console.log(`\n📊 Final: ${announcedCount}/48 teams announced`);

  // Only write if there are actual changes
  const oldJson = JSON.stringify(existing, null, 2);
  const newJson = JSON.stringify(result, null, 2);
  if (oldJson === newJson) {
    console.log('    No changes detected');
  } else {
    fs.writeFileSync(OUTPUT_FILE, newJson, 'utf-8');
    console.log('✅ rosters.json written with changes');
  }
}

// ---- Wikipedia Scraper ----

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

async function fetchWikipediaSquads() {
  // Fetch the "2026 FIFA World Cup squads" page as parsed HTML
  const params = new URLSearchParams({
    action: 'parse',
    page: '2026_FIFA_World_Cup_squads',
    prop: 'text|sections',
    format: 'json',
    redirects: '1',
  });

  const url = `${WIKI_API}?${params.toString()}`;
  const raw = await fetch(url);
  const data = JSON.parse(raw);

  if (data.error) {
    throw new Error(`Wiki API error: ${data.error.info}`);
  }

  const html = data.parse?.text?.['*'] || '';
  const sections = data.parse?.sections || [];

  console.log(`    Wiki page: "${data.parse?.title}" (${sections.length} sections)`);

  // Extract teams from sections
  const teams = [];
  const teamSections = findTeamSections(html, sections);

  for (const [teamNameEn, players] of Object.entries(teamSections)) {
    const info = matchTeam(teamNameEn);
    if (!info) continue;

    teams.push({
      name: info.cn,
      name_en: info.en,
      coach: undefined,
      status: players.length > 0 ? 'announced' : 'pending',
      players: players.map((p, i) => ({
        number: p.number || i + 1,
        name: p.name,
        position: p.position || '未知',
        club: p.club || '未知',
      })),
    });
  }

  return teams;
}

function findTeamSections(html, sections) {
  const result = {};

  // Strategy: find sections whose titles match team names
  for (const sec of sections) {
    const title = (sec.line || '').replace(/<[^>]+>/g, '').trim();
    const info = matchTeam(title);
    if (!info) continue;

    // Extract the HTML for this section
    const sectionHtml = extractSectionHtml(html, sec);
    const players = parseWikiTable(sectionHtml);
    if (players.length > 0) {
      result[info.en] = players;
    }
  }

  return result;
}

function extractSectionHtml(fullHtml, section) {
  // Section has byteoffset, so we need to find the corresponding HTML range
  // Simplified: use regex to find the section by its anchor id
  if (section.anchor) {
    const startTag = `id="${section.anchor}"`;
    const startIdx = fullHtml.indexOf(startTag);
    if (startIdx >= 0) {
      // Find the next section's start tag
      const nextH = fullHtml.indexOf('<h2', startIdx + 1);
      const nextH3 = fullHtml.indexOf('<h3', startIdx + 1);
      let endIdx = -1;
      if (nextH >= 0 && nextH3 >= 0) endIdx = Math.min(nextH, nextH3);
      else if (nextH >= 0) endIdx = nextH;
      else if (nextH3 >= 0) endIdx = nextH3;

      if (endIdx >= 0) {
        return fullHtml.substring(startIdx, endIdx);
      }
      return fullHtml.substring(startIdx);
    }
  }
  return '';
}

function parseWikiTable(html) {
  const players = [];

  // Find all table rows
  const tableRegex = /<table[^>]*class="wikitable"[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const rows = tableMatch[1].match(/<tr>([\s\S]*?)<\/tr>/gi) || [];
    for (const row of rows) {
      const tdContent = [];
      const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(row)) !== null) {
        tdContent.push(stripTags(tdMatch[1]));
      }

      // Wiki squad table: No. | Pos. | Player | Club
      if (tdContent.length >= 3) {
        const num = parseInt(tdContent[0], 10);
        if (!isNaN(num) && num >= 1 && num <= 30) {
          players.push({
            number: num,
            position: tdContent[1] || '未知',
            name: cleanPlayerName(tdContent[2] || ''),
            club: cleanClubName(tdContent[3] || '未知'),
          });
        }
      }
    }
  }

  return players;
}

// ---- Parsing Helpers ----

function parseAnyFormat(raw) {
  try {
    const data = JSON.parse(raw);
    // Already our format
    if (data.teams && Array.isArray(data.teams)) return data.teams;
    // Raw rosters.json format
    if (data.rosters) {
      const teams = [];
      for (const [name, info] of Object.entries(data.rosters)) {
        const mapped = matchTeam(name);
        const players = Array.isArray(info.players) ? info.players : [];
        teams.push({
          name: mapped ? mapped.cn : name,
          name_en: mapped ? mapped.en : name,
          coach: info.coach,
          status: players.length > 0 ? 'announced' : 'pending',
          players: players.map((p, i) => ({
            number: p.number || i + 1,
            name: p.name,
            position: p.position || '未知',
            club: p.club || '未知',
          })),
          expected_date: info.announced,
        });
      }
      return teams;
    }
  } catch { /* not JSON */ }
  return null;
}

function matchTeam(name) {
  const lower = name.toLowerCase().trim();
  // Direct match
  if (NAME_MAP[lower]) return NAME_MAP[lower];
  // Contains match
  for (const [key, info] of Object.entries(NAME_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return info;
  }
  return null;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d))
    .replace(/&nbsp;/g, ' ').trim();
}

function cleanPlayerName(name) {
  return name.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
}

function cleanClubName(name) {
  return name.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').trim();
}

// ---- File I/O ----

function loadExistingJson() {
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

// ---- Run ----

main().catch((err) => {
  console.error(`\n❌ Fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
