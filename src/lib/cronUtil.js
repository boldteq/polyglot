'use strict';

// Shared cron next-run helper — single source of truth for both the
// user-schedule route (src/routes/schedules.js) and the system-schedule engine
// (src/lib/systemSchedules.js) so the two can never drift. Always UTC.
const { CronExpressionParser } = require('cron-parser');

function computeNextRunAt(cronExpr) {
  if (!cronExpr) return null;
  try {
    const it = CronExpressionParser.parse(cronExpr, { tz: 'Etc/UTC' });
    return it.next().toDate().toISOString();
  } catch {
    return null;
  }
}

// The next `count` fire times for a cron (ISO strings), for the upcoming-timeline.
// cron-parser supports repeated next() calls. `from` optionally sets the anchor.
function computeNextRuns(cronExpr, count = 3, from) {
  if (!cronExpr) return [];
  const n = Math.min(Math.max(parseInt(count, 10) || 3, 1), 50);
  try {
    const opts = { tz: 'Etc/UTC' };
    if (from) opts.currentDate = from;
    const it = CronExpressionParser.parse(cronExpr, opts);
    const out = [];
    for (let i = 0; i < n; i++) out.push(it.next().toDate().toISOString());
    return out;
  } catch {
    return [];
  }
}

module.exports = { computeNextRunAt, computeNextRuns };
