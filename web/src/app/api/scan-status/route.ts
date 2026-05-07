import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLatestScanRun } from "@/lib/queries";

/**
 * GET /api/scan-status
 *
 * Lightweight polling endpoint. Returns the latest scan_runs row.
 * The scan-panel client component polls this every 3s while a scan is running.
 */
export async function GET(): Promise<NextResponse> {
  await requireUser();
  const scanRun = await getLatestScanRun();
  return NextResponse.json({ scanRun });
}

export const dynamic = "force-dynamic";
