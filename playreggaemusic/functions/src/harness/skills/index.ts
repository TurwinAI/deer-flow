/**
 * Skills system. Mirrors DeerFlow's `deerflow/skills`.
 * SKILL.md discovery/parse/inject + `/skill task` slash-activation land in B04.
 */
export interface SkillMeta {
  name: string;
  description: string;
  allowedTools?: string[];
  enabled: boolean;
}
