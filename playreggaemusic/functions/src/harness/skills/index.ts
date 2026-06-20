/**
 * Skills system. Mirrors DeerFlow's `deerflow/skills` (parser, slash activation,
 * loader, prompt injection) in TypeScript.
 *
 * Skill format: a directory `<skillsRoot>/{public,custom}/<skill-name>/SKILL.md`
 * with YAML frontmatter (`name`, `description`, optional `license`, optional
 * `allowed-tools` list) plus a markdown body. Frontmatter is parsed with the
 * `gray-matter` library; the kebab-cased `allowed-tools` field is mapped to the
 * camelCase `allowedTools` here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

/** Categories a skill can belong to (mirrors DeerFlow's SkillCategory). */
export type SkillCategory = "public" | "custom";

/** Reserved channel/control commands that must never resolve to a skill. */
export const RESERVED_SLASH_COMMANDS: ReadonlySet<string> = new Set([
  "new",
  "help",
  "bootstrap",
  "status",
  "models",
  "memory",
]);

const SKILL_MD_FILE = "SKILL.md";

/**
 * Strict `/skill-name task` matcher. Mirrors DeerFlow's `_SLASH_SKILL_RE`:
 * the message must start with `/`, a kebab-case name, then either end-of-string
 * or whitespace before the task. Anchored at the start with no leading
 * whitespace tolerated.
 */
const SLASH_SKILL_RE = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(\s+|$)/;

/** Metadata parsed from a SKILL.md frontmatter block. */
export interface SkillMeta {
  name: string;
  description: string;
  license?: string;
  allowedTools?: string[];
}

/** A loaded skill: its metadata plus runtime/discovery state and body text. */
export interface SkillRecord extends SkillMeta {
  enabled: boolean;
  category: SkillCategory;
  path: string;
  body: string;
}

/** A successful slash-activation resolution. */
export interface ResolvedSlashSkill {
  skill: SkillRecord;
  task: string;
}

/** Narrow an unknown YAML value to a non-empty trimmed string, else undefined. */
function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parse the optional `allowed-tools` frontmatter field. Returns undefined when
 * omitted/null, a string[] when it is a YAML sequence of non-empty strings
 * (including [] for an explicit no-tool skill). Throws on malformed values.
 */
function parseAllowedTools(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error("allowed-tools must be a list of strings");
  }
  const tools: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new Error("allowed-tools must contain only strings");
    }
    const tool = item.trim();
    if (!tool) {
      throw new Error("allowed-tools cannot contain empty tool names");
    }
    tools.push(tool);
  }
  return tools;
}

/**
 * Parse a SKILL.md markdown document into metadata + body.
 *
 * @throws if the YAML frontmatter is missing the required `name` or
 *   `description` fields, or if `allowed-tools` is malformed.
 */
export function parseSkill(markdown: string): { meta: SkillMeta; body: string } {
  const parsed = matter(markdown);
  // gray-matter types `data` as a loose Record; treat the values as unknown and
  // validate explicitly rather than trusting the parsed shape.
  const data = parsed.data as Record<string, unknown>;

  const name = asNonEmptyString(data.name);
  if (!name) {
    throw new Error("SKILL.md frontmatter is missing a non-empty 'name'");
  }
  const description = asNonEmptyString(data.description);
  if (!description) {
    throw new Error("SKILL.md frontmatter is missing a non-empty 'description'");
  }

  const license = asNonEmptyString(data.license);
  const allowedTools = parseAllowedTools(data["allowed-tools"]);

  const meta: SkillMeta = { name, description };
  if (license !== undefined) meta.license = license;
  if (allowedTools !== undefined) meta.allowedTools = allowedTools;

  return { meta, body: parsed.content };
}

/** Recursively collect SKILL.md file paths under a category directory. */
function findSkillFiles(categoryDir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(categoryDir);
  } catch {
    // Missing/unreadable category directory: tolerate (e.g. no custom/ yet).
    return out;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(categoryDir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      out.push(...findSkillFiles(full));
    } else if (entry === SKILL_MD_FILE) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Recursively scan `<skillsRoot>/public` and `<skillsRoot>/custom` for SKILL.md
 * files, parse each, and return SkillRecords. Skills default to `enabled: true`
 * (actual enabled state would come from an extensions config). A missing
 * category directory (e.g. no custom/ yet) is tolerated.
 */
export function loadSkills(skillsRoot: string): SkillRecord[] {
  const categories: SkillCategory[] = ["public", "custom"];
  const records: SkillRecord[] = [];

  for (const category of categories) {
    const categoryDir = join(skillsRoot, category);
    for (const skillFile of findSkillFiles(categoryDir)) {
      const markdown = readFileSync(skillFile, "utf8");
      const { meta, body } = parseSkill(markdown);
      records.push({
        ...meta,
        enabled: true,
        category,
        path: skillFile,
        body,
      });
    }
  }

  return records;
}

/**
 * Render the enabled-skills section for the agent system prompt. Each enabled
 * skill becomes a `- /<name>: <description>` line. Returns "" when no skill is
 * enabled, so callers can inject it unconditionally.
 */
export function buildSkillsPromptSection(skills: SkillRecord[]): string {
  const lines = skills
    .filter((skill) => skill.enabled)
    .map((skill) => `- /${skill.name}: ${skill.description}`);
  return lines.length > 0 ? lines.join("\n") : "";
}

/**
 * Resolve strict `/skill-name task` activation against the known skills.
 *
 * Mirrors DeerFlow's resolver: rejects leading whitespace before `/`, requires
 * a kebab-case name followed by whitespace + task or end-of-string, rejects
 * reserved channel commands, unknown skills, and disabled skills. On success
 * returns the matched SkillRecord and the trimmed remaining task text.
 */
export function resolveSlashActivation(
  message: string,
  skills: SkillRecord[],
): ResolvedSlashSkill | null {
  // Leading whitespace before `/` is not a slash activation.
  if (message.length > 0 && /^\s/.test(message)) {
    return null;
  }

  const match = SLASH_SKILL_RE.exec(message);
  if (!match) return null;

  const name = match[1];
  if (RESERVED_SLASH_COMMANDS.has(name)) return null;

  const skill = skills.find((candidate) => candidate.name === name && candidate.enabled);
  if (!skill) return null;

  const task = message.slice(match[0].length).trim();
  return { skill, task };
}
