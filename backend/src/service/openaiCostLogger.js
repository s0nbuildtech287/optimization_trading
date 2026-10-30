const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_DIR = path.resolve(__dirname, '..', '..', 'openai');
const RAW_LOG_PATH = path.join(LOG_DIR, 'chat-cost-log.jsonl');
const REPORT_PATH = path.join(LOG_DIR, 'daily-chat-cost-report.md');
const TIME_ZONE = process.env.OPENAI_COST_TIME_ZONE || 'Asia/Bangkok';
const USD_TO_VND = Number(process.env.OPENAI_COST_USD_TO_VND || 25400);

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timestampFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getParts(date, formatter) {
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function getDateKey(date = new Date()) {
  const parts = getParts(date, dateFormatter);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTimestampLabel(date = new Date()) {
  const parts = getParts(date, timestampFormatter);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${TIME_ZONE}`;
}

function getApiKeyFingerprint() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return 'missing';
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

function formatUsd(value) {
  return Number(value || 0).toFixed(6);
}

function formatVnd(value) {
  return Math.round(Number(value || 0)).toLocaleString('vi-VN');
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function readEntries() {
  if (!fs.existsSync(RAW_LOG_PATH)) return [];
  const raw = fs.readFileSync(RAW_LOG_PATH, 'utf8').trim();
  if (!raw) return [];

  return raw
    .split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);
}

function rebuildReport() {
  ensureLogDir();

  const entries = readEntries();
  const grouped = new Map();

  for (const entry of entries) {
    if (!entry?.dateKey) continue;

    const bucket = grouped.get(entry.dateKey) || {
      entries: [],
      totalUsd: 0,
      totalTokens: 0,
    };

    bucket.entries.push(entry);
    bucket.totalUsd += Number(entry.costUsd || 0);
    bucket.totalTokens += Number(entry.totalTokens || 0);
    grouped.set(entry.dateKey, bucket);
  }

  const dates = [...grouped.keys()].sort().reverse();
  const nowLabel = getTimestampLabel();
  const fingerprint = getApiKeyFingerprint();

  const lines = [
    '# OpenAI Chat Cost Report',
    '',
    `- API key fingerprint: \`${fingerprint}\``,
    `- Time zone: \`${TIME_ZONE}\``,
    `- USD to VND rate: \`${USD_TO_VND}\``,
    `- Last updated: ${nowLabel}`,
    `- Ordering: newest chat entries appear first, older entries move downward`,
    '',
  ];

  if (!dates.length) {
    lines.push('No chat usage recorded yet.');
    lines.push('');
  }

  for (const dateKey of dates) {
    const bucket = grouped.get(dateKey);
    const sortedEntries = bucket.entries
      .slice()
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    const totalVnd = bucket.totalUsd * USD_TO_VND;

    lines.push(`## ${dateKey}`);
    lines.push('');
    lines.push(`- Chat calls: ${sortedEntries.length}`);
    lines.push(`- Total tokens: ${bucket.totalTokens}`);
    lines.push(`- Total cost: $${formatUsd(bucket.totalUsd)} (~${formatVnd(totalVnd)} VND)`);
    lines.push('');
    lines.push('| Time | Model | Prompt tokens | Completion tokens | Total tokens | Cost (USD) | Cost (VND) | User |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');

    for (const entry of sortedEntries) {
      lines.push(
        `| ${escapeCell(entry.timestampLabel)} | \`${escapeCell(entry.model)}\` | ${Number(entry.inputTokens || 0)} | ${Number(entry.outputTokens || 0)} | ${Number(entry.totalTokens || 0)} | $${formatUsd(entry.costUsd)} | ${formatVnd(entry.costVnd)} | \`${escapeCell(entry.userId)}\` |`
      );
    }

    lines.push('');
  }

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function recordChatCost({
  model,
  userId,
  inputTokens,
  outputTokens,
  totalTokens,
  costUsd,
  finishReason,
}) {
  ensureLogDir();

  const now = new Date();
  const entry = {
    timestamp: now.toISOString(),
    timestampLabel: getTimestampLabel(now),
    dateKey: getDateKey(now),
    apiKeyFingerprint: getApiKeyFingerprint(),
    model,
    userId,
    inputTokens: Number(inputTokens || 0),
    outputTokens: Number(outputTokens || 0),
    totalTokens: Number(totalTokens || 0),
    costUsd: Number(costUsd || 0),
    costVnd: Number(costUsd || 0) * USD_TO_VND,
    finishReason: finishReason || '',
  };

  fs.appendFileSync(RAW_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  rebuildReport();

  console.log(
    `💰 [OPENAI COST] ${entry.timestampLabel} | model=${model} | cost=$${formatUsd(entry.costUsd)} (~${formatVnd(entry.costVnd)} VND) | total=${entry.totalTokens} tokens`
  );

  return entry;
}

module.exports = {
  recordChatCost,
  rebuildReport,
  RAW_LOG_PATH,
  REPORT_PATH,
};
