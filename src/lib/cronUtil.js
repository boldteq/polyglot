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

module.exports = { computeNextRunAt };
