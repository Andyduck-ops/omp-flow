import * as fs from 'fs';
import * as path from 'path';

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  source?: string;
  tools?: string[];
  model?: string[];
  thinkingLevel?: string;
}

function stripCommentOutsideQuotes(value: string): string {
  let quote: 'single' | 'double' | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && quote !== 'double') {
      quote = quote === 'single' ? undefined : 'single';
    } else if (char === '"' && quote !== 'single') {
      quote = quote === 'double' ? undefined : 'double';
    } else if (char === '#' && quote === undefined) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

function unquoteScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

function splitOutsideQuotes(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let quote: 'single' | 'double' | undefined;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && quote !== 'double') {
      quote = quote === 'single' ? undefined : 'single';
    } else if (char === '"' && quote !== 'single') {
      quote = quote === 'double' ? undefined : 'double';
    } else if (char === delimiter && quote === undefined) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

export function parseToolsField(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    const arrayTools = value
      .map((item) => unquoteScalar(stripCommentOutsideQuotes(item)))
      .filter((item) => item.length > 0);
    return arrayTools.length > 0 ? arrayTools : undefined;
  }

  const withoutComment = stripCommentOutsideQuotes(value.trim());
  const inlineArray = withoutComment.startsWith('[') && withoutComment.endsWith(']')
    ? withoutComment.slice(1, -1)
    : withoutComment;
  const tools = splitOutsideQuotes(inlineArray, ',')
    .map((item) => unquoteScalar(stripCommentOutsideQuotes(item)))
    .filter((item) => item.length > 0);
  return tools.length > 0 ? tools : undefined;
}

function parseStringListField(value: string | string[] | undefined): string[] | undefined {
  return parseToolsField(value);
}

export function stripFrontmatter(raw: string): { frontmatter: Record<string, string | string[]>; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0] !== '---') {
    return { frontmatter: {}, body: normalized };
  }

  const closingLine = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closingLine === -1) {
    return { frontmatter: {}, body: normalized };
  }

  const fmLines = lines.slice(1, closingLine);
  const body = lines.slice(closingLine + 1).join('\n');
  const frontmatter: Record<string, string | string[]> = {};
  const keyPattern = /^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/;

  for (let i = 0; i < fmLines.length; i += 1) {
    const match = fmLines[i].match(keyPattern);
    if (!match) continue;

    const key = match[1];
    const value = stripCommentOutsideQuotes(match[2].trim()).trim();

    if (value === '|' || value === '>') {
      const blockLines: string[] = [];
      for (let j = i + 1; j < fmLines.length; j += 1) {
        if (keyPattern.test(fmLines[j])) break;
        blockLines.push(fmLines[j].replace(/^  /, ''));
        i = j;
      }
      frontmatter[key] = value === '>' ? blockLines.map((line) => line.trim()).join(' ').trim() : blockLines.join('\n').trimEnd();
    } else if (value === '' && i + 1 < fmLines.length && /^\s+-\s/.test(fmLines[i + 1])) {
      const items: string[] = [];
      for (let j = i + 1; j < fmLines.length && /^\s+-\s/.test(fmLines[j]); j += 1) {
        items.push(unquoteScalar(stripCommentOutsideQuotes(fmLines[j].replace(/^\s+-\s*/, ''))));
        i = j;
      }
      frontmatter[key] = items;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = splitOutsideQuotes(value.slice(1, -1), ',')
        .map((item) => unquoteScalar(stripCommentOutsideQuotes(item)))
        .filter((item) => item.length > 0);
    } else {
      frontmatter[key] = unquoteScalar(value);
    }
  }

  return { frontmatter, body };
}

export function loadAgentDefinition(workspaceDir: string, role: string): AgentDefinition {
  const agentPath = path.join(workspaceDir, '.omp', 'agents', `${role}.md`);
  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent definition not found for role ${role}: expected .omp/agents/${role}.md`);
  }

  const raw = fs.readFileSync(agentPath, 'utf-8');
  const { frontmatter, body } = stripFrontmatter(raw);
  const tools = parseToolsField(frontmatter.tools);
  const model = parseStringListField(frontmatter.model);
  if (!tools || tools.length === 0) {
    throw new Error(`Agent definition for role ${role} must declare non-empty tools frontmatter`);
  }

  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : role,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    systemPrompt: body,
    source: 'project',
    tools,
    model,
    thinkingLevel: typeof frontmatter.thinkingLevel === 'string' ? frontmatter.thinkingLevel : undefined,
  };
}
