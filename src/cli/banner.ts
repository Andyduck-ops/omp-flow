const RESET = '\u001b[0m';
const BOLD = '\u001b[1m';

const WIDE_OMP_ART = [
  ' ██████╗ ███╗   ███╗██████╗ ',
  '██╔═══██╗████╗ ████║██╔══██╗',
  '██║   ██║██╔████╔██║██████╔╝',
  '██║   ██║██║╚██╔╝██║██╔═══╝ ',
  '╚██████╔╝██║ ╚═╝ ██║██║     ',
  ' ╚═════╝ ╚═╝     ╚═╝╚═╝     ',
];

const WIDE_CONNECTOR = [
  '         ',
  '   ───   ',
  '  ━━◆━━  ',
  '   ───   ',
  '         ',
  '         ',
];

const WIDE_FLOW_ART = [
  '███████╗██╗      ██████╗ ██╗    ██╗',
  '██╔════╝██║     ██╔═══██╗██║    ██║',
  '█████╗  ██║     ██║   ██║██║ █╗ ██║',
  '██╔══╝  ██║     ██║   ██║██║███╗██║',
  '██║     ███████╗╚██████╔╝╚███╔███╔╝',
  '╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ ',
];

const OMP_ART = [
  '▄▀▀▄ █▄ ▄█ █▀▀▄',
  '█  █ █ █ █ █▄▄▀',
  ' ▀▀  █   █ █   ',
];

const FLOW_ART = [
  '█▀▀ █    ▄▀▀▄ █   █',
  '█▀  █    █  █ █ █ █',
  '█   █▄▄   ▀▀   ▀▄▀ ',
];

const CONNECTOR = [
  '         ',
  '  ━━◆━━  ',
  '         ',
];

const BEVEL_CHARS: Record<string, true> = { '╔': true, '═': true, '╗': true, '║': true, '╚': true, '╝': true };
interface RGB {
  red: number;
  green: number;
  blue: number;
}

export interface BannerOptions {
  columns?: number;
  color?: boolean;
}

export interface InitSummaryOptions {
  harnesses: readonly string[];
  userName?: string;
  dryRun?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  color?: boolean;
}

export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (raw: string): [number, number, number] | null => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const cur = parse(current);
  const next = parse(latest);
  if (!cur || !next) return false;
  for (let i = 0; i < 3; i += 1) {
    if (next[i] > cur[i]) return true;
    if (next[i] < cur[i]) return false;
  }
  return false;
}

const CYAN: RGB = { red: 84, green: 214, blue: 255 };
const COBALT: RGB = { red: 14, green: 148, blue: 210 };
const GOLD: RGB = { red: 246, green: 200, blue: 95 };
const VIOLET: RGB = { red: 167, green: 139, blue: 250 };
const ORCHID: RGB = { red: 139, green: 92, blue: 246 };
const PINK: RGB = { red: 244, green: 114, blue: 182 };
const EMERALD: RGB = { red: 52, green: 211, blue: 153 };
const SLATE: RGB = { red: 100, green: 116, blue: 139 };
const MUTED: RGB = { red: 148, green: 163, blue: 184 };

function solid(text: string, color: RGB, enabled: boolean, bold = false): string {
  if (!enabled) return text;
  return `${bold ? BOLD : ''}\u001b[38;2;${color.red};${color.green};${color.blue}m${text}${RESET}`;
}

function gradient(
  text: string,
  start: RGB,
  end: RGB,
  enabled: boolean,
  bevelColor?: RGB,
): string {
  if (!enabled) return text;
  const visible = [...text].filter(character => character !== ' ').length;
  let index = 0;
  return [...text].map(character => {
    if (character === ' ') return character;
    const ratio = visible <= 1 ? 0 : index / (visible - 1);
    index += 1;
    if (bevelColor && BEVEL_CHARS[character]) {
      return `\u001b[38;2;${bevelColor.red};${bevelColor.green};${bevelColor.blue}m` + character;
    }
    const r = Math.round(start.red + ((end.red - start.red) * ratio));
    const g = Math.round(start.green + ((end.green - start.green) * ratio));
    const b = Math.round(start.blue + ((end.blue - start.blue) * ratio));
    return `\u001b[38;2;${r};${g};${b}m` + character;
  }).join('') + RESET;
}

export function supportsBannerColor(
  environment: NodeJS.ProcessEnv = process.env,
  isTTY = Boolean(process.stdout.isTTY),
): boolean {
  if ('NO_COLOR' in environment || environment.TERM === 'dumb') return false;
  if (environment.FORCE_COLOR === '0') return false;
  if (environment.FORCE_COLOR !== undefined) return true;
  return isTTY;
}

export function renderCliBanner(options: BannerOptions = {}): string {
  const columns = options.columns ?? process.stdout.columns ?? 80;
  const color = options.color ?? supportsBannerColor();

  if (columns < 28) {
    return `${solid('◆', GOLD, color)} ${solid('omp-flow', CYAN, color)}`;
  }

  if (columns < 52) {
    return [
      `${solid('◆', GOLD, color)} ${solid('OMP', CYAN, color)}${solid('━', GOLD, color)}${gradient('FLOW', VIOLET, PINK, color)}`,
      solid('  agent-native workflow', MUTED, color),
    ].join('\n');
  }

  if (columns >= 76) {
    const topBorder = [
      solid('╭───────────────────────── ', SLATE, color),
      solid('✦  O M P ━ F L O W  ✦', GOLD, color, true),
      solid(' ──────────────────────────╮', SLATE, color),
    ].join('');
    const logo = WIDE_OMP_ART.map((ompLine, index) => [
      solid('│ ', SLATE, color),
      gradient(ompLine, CYAN, CYAN, color, COBALT),
      solid(WIDE_CONNECTOR[index], GOLD, color),
      gradient(WIDE_FLOW_ART[index], VIOLET, PINK, color, ORCHID),
      solid(' │', SLATE, color),
    ].join(''));
    const bottomBorder = [
      solid('╰────────────── ', SLATE, color),
      solid('◆', GOLD, color),
      solid('  agent-native workflow orchestration  ', MUTED, color),
      solid('◆', GOLD, color),
      solid(' ─────────────────╯', SLATE, color),
    ].join('');

    return [
      topBorder,
      ...logo,
      bottomBorder,
    ].join('\n');
  }

  const mediumTop = [
    solid('╭──────────── ', SLATE, color),
    solid('✦  O M P ━ F L O W  ✦', GOLD, color, true),
    solid(' ────────────╮', SLATE, color),
  ].join('');
  const logo = OMP_ART.map((ompLine, index) => [
    solid('│  ', SLATE, color),
    solid(ompLine, CYAN, color),
    solid(CONNECTOR[index], GOLD, color),
    gradient(FLOW_ART[index], VIOLET, PINK, color),
    solid('  │', SLATE, color),
  ].join(''));
  const mediumBottom = [
    solid('╰─── ', SLATE, color),
    solid('◆', GOLD, color),
    solid(' agent-native workflow orchestration ', MUTED, color),
    solid('◆', GOLD, color),
    solid(' ───╯', SLATE, color),
  ].join('');

  return [
    mediumTop,
    ...logo,
    mediumBottom,
  ].join('\n');
}

export function renderInitSummaryCard(options: InitSummaryOptions): string {
  const color = options.color ?? supportsBannerColor();
  const width = 54;
  const inner = width - 4;
  const pad = (visibleText: string, styledText = visibleText): string => {
    const filler = Math.max(0, inner - [...visibleText].length);
    return `${solid('│ ', SLATE, color)}${styledText}${' '.repeat(filler)}${solid(' │', SLATE, color)}`;
  };
  const statusText = options.dryRun ? 'preview' : 'ready';
  const statusColor = options.dryRun ? GOLD : EMERALD;
  const topRaw = `─ ✦ omp-flow ${statusText} `;
  const topDashes = Math.max(0, width - 2 - [...topRaw].length);
  const top = [
    solid('╭─ ', SLATE, color),
    solid('✦ ', GOLD, color),
    solid('omp-flow ', CYAN, color, true),
    solid(statusText, statusColor, color, true),
    solid(` ${'─'.repeat(topDashes)}╮`, SLATE, color),
  ].join('');

  const mark = options.dryRun ? solid('·', GOLD, color) : solid('✓', EMERALD, color, true);
  const rawMark = options.dryRun ? '·' : '✓';
  const harnessList = options.harnesses.join(' · ');
  const lines: string[] = [
    top,
    pad(
      `${rawMark} AI Tools   ${harnessList}`,
      `${mark} ${solid('AI Tools', MUTED, color)}   ${solid(harnessList, VIOLET, color, true)}`,
    ),
  ];
  if (options.userName !== undefined) {
    lines.push(
      pad(
        `${rawMark} Git User   ${options.userName}`,
        `${mark} ${solid('Git User', MUTED, color)}   ${solid(options.userName, GOLD, color, true)}`,
      ),
    );
  }
  if (
    options.currentVersion
    && options.latestVersion
    && isNewerVersion(options.currentVersion, options.latestVersion)
  ) {
    const cur = options.currentVersion.replace(/^v/, '');
    const next = options.latestVersion.replace(/^v/, '');
    lines.push(
      pad(
        `↑ Update     v${cur} → v${next} (npm i -g omp-flow)`,
        `${solid('↑', GOLD, color, true)} ${solid('Update', GOLD, color, true)}     ${solid(`v${cur} → v${next}`, GOLD, color, true)} ${solid('(npm i -g omp-flow)', MUTED, color)}`,
      ),
    );
  }
  if (!options.dryRun) {
    lines.push(
      pad('', ''),
      pad(
        '→ Open your AI tool and start chatting',
        `${solid('→', CYAN, color, true)} ${solid('Open your AI tool and start chatting', MUTED, color)}`,
      ),
    );
  }
  lines.push(solid(`╰${'─'.repeat(width - 2)}╯`, SLATE, color));
  return lines.join('\n');
}
