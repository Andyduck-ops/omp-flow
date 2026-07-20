/**
 * Trae IDE templates
 *
 * These are GENERIC templates for user projects.
 *
 * Directory structure:
 *   trae/
 *   ├── agents/         # Multi-agent pipeline agents (Markdown)
 *   └── hooks.json     # Hook configuration
 */

import {
  createTemplateReader,
  type AgentTemplate,
  type HookTemplate,
} from "../template-utils.js";

export type { AgentTemplate, HookTemplate };

const { listMdAgents, getSettings } = createTemplateReader(import.meta.url);

export const getAllAgents = (): AgentTemplate[] => listMdAgents();
export const getSettingsTemplate = (): HookTemplate =>
  getSettings("hooks.json");
