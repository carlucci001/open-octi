import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listBuilderProjects,
  loadBuilderProject,
  saveBuilderProject,
  VaultValidationError,
} from "../lib/builderProjectVault";

describe("Builder project vault", () => {
  let root;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "fcc-builder-vault-"));
    process.env.BUILDER_PROJECTS_ROOT = root;
  });

  afterEach(async () => {
    delete process.env.BUILDER_PROJECTS_ROOT;
    await fs.rm(root, { recursive: true, force: true });
  });

  it("stores and restores a private project snapshot", async () => {
    const metadata = await saveBuilderProject("usr_owner", {
      projectId: "chat_1",
      name: "Demonstration app",
      messages: [
        { id: "m1", role: "user", content: "Build a demonstration app" },
      ],
      snapshot: {
        chatIndex: "m1",
        files: {
          "/home/project/package.json": {
            type: "file",
            content: '{"name":"demo"}',
            isBinary: false,
          },
        },
      },
    });

    expect(metadata).toMatchObject({
      projectId: "chat_1",
      name: "Demonstration app",
      fileCount: 1,
    });
    const projects = await listBuilderProjects("usr_owner");
    expect(projects).toHaveLength(1);

    const restored = await loadBuilderProject("usr_owner", "chat_1");
    expect(restored.messages[0].content).toBe("Build a demonstration app");
    expect(
      restored.snapshot.files["/home/project/package.json"].content,
    ).toContain("demo");
    if (process.platform !== "win32") {
      expect((await fs.stat(path.join(root, "usr_owner"))).mode & 0o077).toBe(
        0,
      );
    }
  });

  it("rejects identifiers that could escape the owner vault", async () => {
    await expect(
      saveBuilderProject("usr_owner", {
        projectId: "../outside",
        messages: [],
        snapshot: { files: {} },
      }),
    ).rejects.toBeInstanceOf(VaultValidationError);
  });
});
