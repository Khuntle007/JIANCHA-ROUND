// Single-process background jobs: SCM reminders every 15 min, Business Central sync check hourly, rate-limit sweep.
import { remindPending } from './lib/drop';
import { bcAutoSync } from './lib/bc';
import { sweepBuckets } from './lib/ratelimit';

if (process.env.JOBS_DISABLED !== '1') {
  const safe = (f: () => Promise<unknown>) => () => { f().catch(e => console.error('[job]', e)); };
  setInterval(safe(remindPending), 15 * 60_000).unref();
  setInterval(safe(bcAutoSync), 60 * 60_000).unref();
  setInterval(safe(sweepBuckets), 60 * 60_000).unref();
  setTimeout(safe(bcAutoSync), 20_000).unref();
}
