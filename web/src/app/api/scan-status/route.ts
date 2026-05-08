import { NextResponse } from "next/server";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { execute } from "@/lib/db";
import { getLatestScanRun } from "@/lib/queries";

/**
 * GET /api/scan-status
 *
 * Lightweight polling endpoint. Returns the latest scan_runs row.
 * The scan-panel client component polls this every 3s while a scan is running.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await execute(
    `update scan_runs
     set status = 'failed',
         error = coalesce(error, 'Timed out: stale running scan exceeded safe polling threshold'),
         completed_at = now()
     where status = 'running'
       and started_at < now() - interval '30 minutes'`,
  );

  const scanRun = await getLatestScanRun();
  return NextResponse.json({ scanRun });
}

export const dynamic = "force-dynamic";
