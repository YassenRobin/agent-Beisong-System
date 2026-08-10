const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');

const outputPath = process.env.BEISONG_IMAGERY_OUTPUT
  || path.join(os.tmpdir(), 'beisong-imagery-live-result.json');

async function main() {
  const { initDatabase } = require('../dist-electron/src-server/db/schema.js');
  const { scanImagery } = require('../dist-electron/src-server/services/imageryTraining.js');
  if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA 未设置');
  const dbPath = path.join(process.env.LOCALAPPDATA, 'beisong', 'data', 'beisong.db');
  initDatabase(dbPath);

  const theme = process.env.BEISONG_IMAGERY_THEME || '梧桐';
  const result = await scanImagery({ theme, genre: 'all' });
  const output = JSON.stringify({
    theme: result.theme,
    search_term_details: result.search_term_details,
    scope_article_count: result.scope_article_count,
    literal_match_count: result.literal_match_count,
    rule_filtered_count: result.rule_filtered_count,
    reviewed_count: result.reviewed_count,
    accepted_count: result.accepted_count,
    pending_count: result.pending_count,
    rejected_count: result.rejected_count,
    truncated_count: result.truncated_count,
    cache_hit: result.cache_hit,
    candidates: result.candidates.map((item) => ({
      title: item.title,
      sentence: item.sentence,
      label: item.label,
      evidence: item.evidence,
      confidence: item.confidence,
      reason: item.reason,
    })),
  }, null, 2);
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(output);
}

app.whenReady()
  .then(main)
  .then(() => app.exit(0))
  .catch((error) => {
    const message = error?.message || String(error);
    fs.writeFileSync(outputPath, JSON.stringify({ error: message }, null, 2), 'utf8');
    console.error(message);
    app.exit(1);
  });
