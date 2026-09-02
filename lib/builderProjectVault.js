import { createHash } from "node:crypto";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const MAX_PROJECT_PAYLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_PROJECT_FILES = 5000;
export const MAX_PROJECT_REVISIONS = 20;
export const MAX_OWNER_VAULT_BYTES = 2 * 1024 * 1024 * 1024;

function vaultRoot() {
  if (process.env.BUILDER_PROJECTS_ROOT)
    return path.resolve(process.env.BUILDER_PROJECTS_ROOT);
  return process.platform === "win32"
    ? path.join(process.cwd(), "data", "builder-projects")
    : "/root/farrington-builder-projects";
}

function assertSafeIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new VaultValidationError(`${label} is invalid`);
  }
  return value;
}

function countPayloadFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new VaultValidationError("snapshot files are required");
  }

  const entries = Object.entries(files);
  if (entries.length > MAX_PROJECT_FILES)
    throw new VaultValidationError("project contains too many files");

  for (const [filePath, entry] of entries) {
    if (!filePath || filePath.length > 1024 || filePath.includes("\0")) {
      throw new VaultValidationError("project contains an invalid file path");
    }
    if (entry === undefined) continue;
    if (
      !entry ||
      typeof entry !== "object" ||
      !["file", "folder"].includes(entry.type)
    ) {
      throw new VaultValidationError("project contains an invalid file entry");
    }
    if (entry.type === "file" && typeof entry.content !== "string") {
      throw new VaultValidationError(
        "project contains a file without text content",
      );
    }
  }

  return entries.filter(([, entry]) => entry?.type === "file").length;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new VaultValidationError("project payload is invalid");
  }

  const projectId = assertSafeIdentifier(payload.projectId, "projectId");
  const name =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim().slice(0, 200)
      : `Builder project ${projectId}`;

  if (!Array.isArray(payload.messages) || payload.messages.length > 10000) {
    throw new VaultValidationError("project messages are invalid");
  }
  if (!payload.snapshot || typeof payload.snapshot !== "object") {
    throw new VaultValidationError("project snapshot is required");
  }

  const fileCount = countPayloadFiles(payload.snapshot.files);
  return {
    version: 1,
    projectId,
    name,
    savedAt: new Date().toISOString(),
    messages: payload.messages,
    metadata:
      payload.metadata && typeof payload.metadata === "object"
        ? payload.metadata
        : undefined,
    snapshot: {
      chatIndex:
        typeof payload.snapshot.chatIndex === "string"
          ? payload.snapshot.chatIndex
          : "",
      summary:
        typeof payload.snapshot.summary === "string"
          ? payload.snapshot.summary.slice(0, 20000)
          : undefined,
      files: payload.snapshot.files,
    },
    fileCount,
  };
}

async function ensurePrivateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
}

async function atomicWrite(filePath, data) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, data, { mode: 0o600 });
    await fs.rename(tempPath, filePath);
    await fs.chmod(filePath, 0o600);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function directoryBytes(directory) {
  let total = 0;
  const entries = await fs
    .readdir(directory, { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(entryPath);
    else if (entry.isFile()) total += (await fs.stat(entryPath)).size;
  }
  return total;
}

async function pruneRevisions(projectDirectory) {
  const revisionDirectory = path.join(projectDirectory, "revisions");
  const revisions = (await fs.readdir(revisionDirectory).catch(() => []))
    .filter((name) => name.endsWith(".json.gz"))
    .sort();
  const expired = revisions.slice(
    0,
    Math.max(0, revisions.length - MAX_PROJECT_REVISIONS),
  );
  await Promise.all(
    expired.map((name) =>
      fs.rm(path.join(revisionDirectory, name), { force: true }),
    ),
  );
}

export class VaultValidationError extends Error {}
export class VaultPayloadTooLargeError extends Error {}
export class VaultQuotaError extends Error {}

export async function saveBuilderProject(userId, rawPayload) {
  const safeUserId = assertSafeIdentifier(userId, "userId");
  const payload = validatePayload(rawPayload);
  const serialized = JSON.stringify(payload);
  const uncompressedBytes = Buffer.byteLength(serialized);
  if (uncompressedBytes > MAX_PROJECT_PAYLOAD_BYTES) {
    throw new VaultPayloadTooLargeError(
      "project snapshot exceeds the 25 MB limit",
    );
  }

  const userDirectory = path.join(vaultRoot(), safeUserId);
  const projectDirectory = path.join(userDirectory, payload.projectId);
  const revisionDirectory = path.join(projectDirectory, "revisions");
  await ensurePrivateDirectory(revisionDirectory);

  const compressed = await gzipAsync(Buffer.from(serialized), { level: 6 });
  const currentBytes = await directoryBytes(userDirectory);
  if (currentBytes + compressed.length > MAX_OWNER_VAULT_BYTES) {
    throw new VaultQuotaError(
      "owner Builder vault has reached its storage limit",
    );
  }

  const digest = createHash("sha256").update(serialized).digest("hex");
  const revisionId = `${payload.savedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${digest.slice(0, 12)}`;
  const revisionPath = path.join(revisionDirectory, `${revisionId}.json.gz`);
  await atomicWrite(revisionPath, compressed);
  await atomicWrite(path.join(projectDirectory, "latest.json.gz"), compressed);

  const metadata = {
    projectId: payload.projectId,
    name: payload.name,
    updatedAt: payload.savedAt,
    revisionId,
    fileCount: payload.fileCount,
    uncompressedBytes,
    compressedBytes: compressed.length,
  };
  await atomicWrite(
    path.join(projectDirectory, "metadata.json"),
    JSON.stringify(metadata, null, 2),
  );
  await pruneRevisions(projectDirectory);
  return metadata;
}

export async function listBuilderProjects(userId) {
  const safeUserId = assertSafeIdentifier(userId, "userId");
  const userDirectory = path.join(vaultRoot(), safeUserId);
  const entries = await fs
    .readdir(userDirectory, { withFileTypes: true })
    .catch(() => []);
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.name))
      continue;
    try {
      const metadata = JSON.parse(
        await fs.readFile(
          path.join(userDirectory, entry.name, "metadata.json"),
          "utf8",
        ),
      );
      projects.push(metadata);
    } catch {}
  }

  return projects.sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
}

export async function loadBuilderProject(userId, projectId) {
  const safeUserId = assertSafeIdentifier(userId, "userId");
  const safeProjectId = assertSafeIdentifier(projectId, "projectId");
  const latestPath = path.join(
    vaultRoot(),
    safeUserId,
    safeProjectId,
    "latest.json.gz",
  );
  const compressed = await fs.readFile(latestPath);
  const serialized = await gunzipAsync(compressed);
  return JSON.parse(serialized.toString("utf8"));
}
