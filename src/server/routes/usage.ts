import express from 'express';
import { AuthenticatedRequest, requireOwnerAuth } from '../middleware/auth.ts';
import { adminDb, logFirestoreFallback } from '../services/firebaseAdmin.ts';
import { getCostLimits } from '../services/costGuard.ts';

export const usageRouter = express.Router();

/**
 * GET /api/usage
 * Returns today's spend, daily cap, filterable usage ledger rows,
 * and 7-day daily spend totals for the usage chart.
 */
usageRouter.get('/', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const uid = req.user?.uid;
  const { tool } = req.query;
  const { DAILY_CAP_USD } = getCostLimits();
  const todayStr = new Date().toISOString().slice(0, 10);

  let allRows: any[] = [];

  try {
    const snapshot = await adminDb
      .collection('usage')
      .where('uid', '==', uid)
      .get();

    allRows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err: any) {
    logFirestoreFallback('usage', err);
    allRows = [];
  }

  // Sort newest first
  allRows.sort((a, b) => (b.createdAt || b.timestamp || '') > (a.createdAt || a.timestamp || '') ? 1 : -1);

  // Compute today's spend
  const todaySpend = allRows
    .filter((r) => r.date === todayStr && r.status === 'succeeded')
    .reduce((acc, curr) => acc + (curr.estCostUsd || 0), 0);

  // Compute 7-day history for daily totals chart
  const days: Array<{ day: string; date: string; amount: number; height: number }> = [];
  const maxDaySpend = Math.max(1.0, DAILY_CAP_USD);

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

    const dayAmount = allRows
      .filter((r) => r.date === dateStr && r.status === 'succeeded')
      .reduce((sum, r) => sum + (r.estCostUsd || 0), 0);

    const rounded = Math.round(dayAmount * 1000) / 1000;
    const height = Math.min(100, Math.max(8, Math.round((rounded / maxDaySpend) * 100)));

    days.push({
      day: dayLabel,
      date: dateStr,
      amount: rounded,
      height,
    });
  }

  // Filter rows by tool if requested
  let filteredRows = allRows;
  if (tool && typeof tool === 'string' && tool !== 'all') {
    const toolLower = tool.toLowerCase();
    filteredRows = allRows.filter((r) => {
      const rowTool = (r.tool || '').toLowerCase();
      return rowTool.includes(toolLower);
    });
  }

  return res.json({
    todaySpend: Math.round(todaySpend * 1000) / 1000,
    dailyCap: DAILY_CAP_USD,
    dailyTotals: days,
    rows: filteredRows.slice(0, 100),
  });
});
