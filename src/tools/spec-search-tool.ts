import * as fs from 'fs';
import * as path from 'path';

export interface SpecSearchResult {
  filePath: string;
  category: 'spec' | 'knowhow';
  score: number;
  matches: string[];
}

export function executeMaestroSpecSearch(query: string, workspaceDir: string = process.cwd()): SpecSearchResult[] {
  const targets = [
    { dir: path.join(workspaceDir, '.omp-flow', 'specs'), category: 'spec' as const },
    { dir: path.join(workspaceDir, '.omp-flow', 'knowhow'), category: 'knowhow' as const },
  ];

  const results: SpecSearchResult[] = [];
  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (queryTokens.length === 0) return results;

  for (const { dir, category } of targets) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.json')) {
        const fullPath = path.join(dir, file);
        const fileNameLower = file.toLowerCase();
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const matches: string[] = [];
        let score = 0;

        for (const token of queryTokens) {
          if (fileNameLower.includes(token)) {
            score += 10;
          }
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineLower = line.toLowerCase();

          for (const token of queryTokens) {
            if (lineLower.includes(token)) {
              let weight = 1;
              if (line.trim().startsWith('#')) {
                weight = 5;
              } else if (lineLower.includes('gotcha') || lineLower.includes('rule') || lineLower.includes('requirement')) {
                weight = 3;
              }
              score += weight;
              matches.push(`Line ${i + 1}: ${line.trim()}`);
            }
          }
        }

        if (score > 0 && matches.length > 0) {
          results.push({
            filePath: fullPath,
            category,
            score,
            matches: Array.from(new Set(matches)),
          });
        }
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
