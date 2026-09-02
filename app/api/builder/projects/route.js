import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import {
  listBuilderProjects,
  loadBuilderProject,
  saveBuilderProject,
  VaultPayloadTooLargeError,
  VaultQuotaError,
  VaultValidationError,
} from "@/lib/builderProjectVault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { user, error } = await requireOwner(request);
  if (error) return error;

  const projectId = new URL(request.url).searchParams.get("projectId");
  try {
    if (projectId) {
      const project = await loadBuilderProject(user.id, projectId);
      return NextResponse.json(
        { ok: true, project },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const projects = await listBuilderProjects(user.id);
    return NextResponse.json(
      { ok: true, projects },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      return NextResponse.json(
        { ok: false, error: "project backup not found" },
        { status: 404 },
      );
    }
    if (error instanceof VaultValidationError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }
    console.error("[builder-project-vault] load failed", error);
    return NextResponse.json(
      { ok: false, error: "project vault is unavailable" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const { user, error } = await requireOwner(request);
  if (error) return error;

  try {
    const payload = await request.json();
    const project = await saveBuilderProject(user.id, payload);
    return NextResponse.json(
      { ok: true, project },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof VaultPayloadTooLargeError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 413 },
      );
    }
    if (error instanceof VaultQuotaError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 507 },
      );
    }
    if (error instanceof VaultValidationError || error instanceof SyntaxError) {
      return NextResponse.json(
        { ok: false, error: error.message || "project payload is invalid" },
        { status: 400 },
      );
    }
    console.error("[builder-project-vault] save failed", error);
    return NextResponse.json(
      { ok: false, error: "project backup failed" },
      { status: 500 },
    );
  }
}
