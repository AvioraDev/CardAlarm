import { NextResponse } from "next/server";
import { getLatestScanRun } from "@/lib/queries";

/**
 * GET /api/scan-status
 *
 * Lightweight polling endpoint. Returns the latest scan_runs row.
 * The scan-panel client component polls this every 3s while a scan is running.
 */
export async function GET(): Promise<NextResponse> {
  const scanRun = getLatestScanRun();
  return NextResponse.json({ scanRun });
}

export const dynamic = "force-dynamic";
