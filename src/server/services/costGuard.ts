/**
 * CRENORD Server Cost Guard
 * Cost protection running before any job is submitted.
 * Reads DAILY_CAP_USD and MAX_JOB_USD from Secrets / environment.
 * Default is 0 (no limit). A value of 0 or empty string means no limit.
 */

export interface CostGuardResult {
  allowed: boolean;
  estCostUsd: number;
  reason?: string;
}

export function getCostLimits() {
  const rawDaily = process.env.DAILY_CAP_USD;
  const rawMax = process.env.MAX_JOB_USD;

  // Default when variables are missing, empty or '0': 0 (meaning no limit)
  const dailyCap = rawDaily && rawDaily.trim() !== '' ? parseFloat(rawDaily) : 0;
  const maxJob = rawMax && rawMax.trim() !== '' ? parseFloat(rawMax) : 0;

  return {
    DAILY_CAP_USD: Number.isNaN(dailyCap) ? 0 : dailyCap,
    MAX_JOB_USD: Number.isNaN(maxJob) ? 0 : maxJob,
  };
}

/**
 * Computes estimated cost for a job.
 * Units: image (count), megapixel (MP), second (video duration), character (TTS), minute (audio/dub/music).
 */
export function calculateJobCost(pricePerUnit: number, units: number = 1): number {
  if (pricePerUnit <= 0) return 0;
  const effectiveUnits = units > 0 ? units : 1;
  const cost = pricePerUnit * effectiveUnits;
  return Math.max(0.001, Math.round(cost * 10000) / 10000);
}

/**
 * Verifies that the job cost satisfies per-job and daily spending constraints.
 * 0 or negative means no limit.
 */
export function evaluateCostGuard(
  currentTodaySpend: number,
  jobCostUsd: number,
  overrides?: { dailyCap?: number; maxJob?: number }
): CostGuardResult {
  const limits = getCostLimits();
  const dailyCap = overrides?.dailyCap !== undefined ? overrides.dailyCap : limits.DAILY_CAP_USD;
  const maxJob = overrides?.maxJob !== undefined ? overrides.maxJob : limits.MAX_JOB_USD;

  // Rule 1: Per-job limit check (0 means no limit)
  if (maxJob > 0 && jobCostUsd > maxJob) {
    return {
      allowed: false,
      estCostUsd: jobCostUsd,
      reason: `Job cost ($${jobCostUsd.toFixed(2)}) exceeds maximum per-job limit ($${maxJob.toFixed(2)}). Set MAX_JOB_USD to 0 in Secrets for no limit.`,
    };
  }

  // Rule 2: Daily cap check (0 means no limit)
  if (dailyCap > 0 && currentTodaySpend + jobCostUsd > dailyCap) {
    return {
      allowed: false,
      estCostUsd: jobCostUsd,
      reason: `Daily limit reached. This job would bring today's spend to $${(currentTodaySpend + jobCostUsd).toFixed(2)}, exceeding the daily cap of $${dailyCap.toFixed(2)}. Set DAILY_CAP_USD to 0 in Secrets for no limit.`,
    };
  }

  return {
    allowed: true,
    estCostUsd: jobCostUsd,
  };
}

/**
 * Automated test script to verify Cost Guard rejections.
 */
export function runCostGuardSelfTest(): { passed: boolean; details: string[] } {
  const details: string[] = [];
  const testDailyCap = 3.0;
  const testMaxJob = 1.5;

  // Test 1: Single job exceeding MAX_JOB_USD (e.g. $1.80 > $1.50)
  const res1 = evaluateCostGuard(0, 1.8, { dailyCap: testDailyCap, maxJob: testMaxJob });
  if (!res1.allowed && res1.reason?.includes('exceeds maximum per-job limit')) {
    details.push('PASS: Job exceeding MAX_JOB_USD ($1.80 > $1.50) correctly rejected.');
  } else {
    details.push('FAIL: Job exceeding MAX_JOB_USD was not rejected.');
  }

  // Test 2: Job pushing today's total spend over DAILY_CAP_USD ($2.80 + $0.50 = $3.30 > $3.00)
  const res2 = evaluateCostGuard(2.8, 0.5, { dailyCap: testDailyCap, maxJob: testMaxJob });
  if (!res2.allowed && res2.reason?.includes('Daily limit reached')) {
    details.push("PASS: Job pushing today's spend over DAILY_CAP_USD ($3.30 > $3.00) correctly rejected.");
  } else {
    details.push('FAIL: Job exceeding daily cap was not rejected.');
  }

  // Test 3: Normal valid job within limits ($0.035, today spend $0.50)
  const res3 = evaluateCostGuard(0.5, 0.035, { dailyCap: testDailyCap, maxJob: testMaxJob });
  if (res3.allowed) {
    details.push('PASS: Normal job within limits ($0.035) accepted.');
  } else {
    details.push('FAIL: Normal job was incorrectly rejected.');
  }

  const passed = details.every((d) => d.startsWith('PASS'));
  return { passed, details };
}
