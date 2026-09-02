import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { requireProjectAccess } from "@ssa/server/access-service";

// Serves the input workbook for download. It lives in templates/ at the repo
// root rather than in public/, so that one committed file is both the download
// and the test fixture; streaming it here avoids keeping a second copy in sync.

const WORKBOOK_FILENAME = "OperatorLens_Input_Workbook_v1.xlsx";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  await requireProjectAccess(projectSlug, "operatorLens");

  // cwd is apps/shell when the dev server runs.
  const path = join(process.cwd(), "..", "..", "templates", WORKBOOK_FILENAME);

  try {
    const file = await readFile(path);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${WORKBOOK_FILENAME}"`,
        "Content-Length": String(file.byteLength)
      }
    });
  } catch {
    return NextResponse.json(
      { error: `Could not read templates/${WORKBOOK_FILENAME}.` },
      { status: 404 }
    );
  }
}
