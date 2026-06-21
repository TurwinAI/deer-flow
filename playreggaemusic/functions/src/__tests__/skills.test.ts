import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSkillsPromptSection,
  loadSkills,
  parseSkill,
  resolveSlashActivation,
  type SkillRecord,
} from "../harness/skills";

// The committed seed skills live at playreggaemusic/skills, two levels above
// functions/src (functions/src/__tests__ -> functions/src -> functions -> playreggaemusic).
const SKILLS_ROOT = resolve(__dirname, "..", "..", "..", "skills");

function makeRecord(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    name: "release-curator",
    description: "Draft and curate a release.",
    enabled: true,
    category: "public",
    path: "/virtual/release-curator/SKILL.md",
    body: "# body",
    ...overrides,
  };
}

describe("parseSkill (B04)", () => {
  it("parses valid frontmatter into meta and preserves the body", () => {
    const md = [
      "---",
      "name: release-curator",
      'description: "Draft and curate a release."',
      "license: proprietary",
      "allowed-tools:",
      "  - create_release",
      "  - create_track",
      "---",
      "",
      "# Release Curator",
      "",
      "Body content here.",
    ].join("\n");

    const { meta, body } = parseSkill(md);
    expect(meta.name).toBe("release-curator");
    expect(meta.description).toBe("Draft and curate a release.");
    expect(meta.license).toBe("proprietary");
    // allowed-tools (kebab) maps to allowedTools (camel).
    expect(meta.allowedTools).toEqual(["create_release", "create_track"]);
    expect(body).toContain("# Release Curator");
    expect(body).toContain("Body content here.");
  });

  it("supports an inline-list allowed-tools and an empty list", () => {
    const inline = parseSkill(
      ["---", "name: a", "description: d", "allowed-tools: [x, y]", "---", "body"].join("\n"),
    );
    expect(inline.meta.allowedTools).toEqual(["x", "y"]);

    const empty = parseSkill(
      ["---", "name: a", "description: d", "allowed-tools: []", "---", "body"].join("\n"),
    );
    expect(empty.meta.allowedTools).toEqual([]);
  });

  it("omits allowedTools when the field is absent", () => {
    const { meta } = parseSkill(["---", "name: a", "description: d", "---", "body"].join("\n"));
    expect(meta.allowedTools).toBeUndefined();
  });

  it("throws when the required name is missing", () => {
    const md = ["---", 'description: "no name here"', "---", "body"].join("\n");
    expect(() => parseSkill(md)).toThrow(/name/);
  });

  it("throws when the required description is missing", () => {
    const md = ["---", "name: orphan", "---", "body"].join("\n");
    expect(() => parseSkill(md)).toThrow(/description/);
  });

  it("throws when allowed-tools is not a list", () => {
    const md = ["---", "name: a", "description: d", "allowed-tools: nope", "---", "body"].join("\n");
    expect(() => parseSkill(md)).toThrow(/allowed-tools/);
  });
});

describe("loadSkills (B04)", () => {
  it("loads both committed public seed skills, enabled, with category public", () => {
    const skills = loadSkills(SKILLS_ROOT);
    const byName = new Map(skills.map((s) => [s.name, s]));

    const curator = byName.get("release-curator");
    const copywriter = byName.get("catalog-copywriter");

    expect(curator).toBeDefined();
    expect(copywriter).toBeDefined();

    for (const skill of [curator, copywriter]) {
      expect(skill?.category).toBe("public");
      expect(skill?.enabled).toBe(true);
      expect(skill?.description.length).toBeGreaterThan(0);
      expect(skill?.body.length).toBeGreaterThan(0);
      expect(skill?.path.endsWith("SKILL.md")).toBe(true);
    }

    expect(curator?.allowedTools).toEqual(["create_release", "create_track"]);
  });

  it("tolerates a missing custom/ directory", () => {
    // The seed repo has no custom/ dir; loadSkills must not throw and should
    // still return the public skills.
    expect(() => loadSkills(SKILLS_ROOT)).not.toThrow();
    const skills = loadSkills(SKILLS_ROOT);
    expect(skills.every((s) => s.category === "public")).toBe(true);
  });

  it("returns [] for a skillsRoot with no public or custom dirs", () => {
    expect(loadSkills(resolve(__dirname, "does-not-exist"))).toEqual([]);
  });
});

describe("buildSkillsPromptSection (B04)", () => {
  it("renders an enabled-skills list with /name: description lines", () => {
    const section = buildSkillsPromptSection(loadSkills(SKILLS_ROOT));
    expect(section).toContain("/release-curator");
    expect(section).toContain("/catalog-copywriter");
    expect(section.split("\n").every((line) => line.startsWith("- /"))).toBe(true);
  });

  it("returns '' for an empty list", () => {
    expect(buildSkillsPromptSection([])).toBe("");
  });

  it("returns '' when every skill is disabled", () => {
    const disabled = [makeRecord({ enabled: false }), makeRecord({ name: "catalog-copywriter", enabled: false })];
    expect(buildSkillsPromptSection(disabled)).toBe("");
  });
});

describe("resolveSlashActivation (B04)", () => {
  const skills = [
    makeRecord({ name: "release-curator" }),
    makeRecord({ name: "catalog-copywriter", description: "Write copy." }),
  ];

  it("resolves '/skill task' to the skill plus the trimmed task", () => {
    const resolved = resolveSlashActivation("/release-curator draft the debut single", skills);
    expect(resolved?.skill.name).toBe("release-curator");
    expect(resolved?.task).toBe("draft the debut single");
  });

  it("resolves a bare '/skill' to an empty task", () => {
    const resolved = resolveSlashActivation("/catalog-copywriter", skills);
    expect(resolved?.skill.name).toBe("catalog-copywriter");
    expect(resolved?.task).toBe("");
  });

  it("rejects leading whitespace before the slash", () => {
    expect(resolveSlashActivation(" /release-curator x", skills)).toBeNull();
  });

  it("rejects reserved channel commands", () => {
    expect(resolveSlashActivation("/help", skills)).toBeNull();
    expect(resolveSlashActivation("/memory dump everything", skills)).toBeNull();
  });

  it("rejects unknown skills", () => {
    expect(resolveSlashActivation("/nope x", skills)).toBeNull();
  });

  it("rejects a disabled skill", () => {
    const disabled = [makeRecord({ name: "release-curator", enabled: false })];
    expect(resolveSlashActivation("/release-curator do it", disabled)).toBeNull();
  });
});
