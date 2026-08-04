const RESET = '\u001b[0m';

const WIDE_OMP_ART = [
  ' █████  ██   ██ ██████ ',
  '██   ██ ███ ███ ██   ██',
  '██   ██ ██ █ ██ ██████ ',
  '██   ██ ██   ██ ██     ',
  ' █████  ██   ██ ██     ',
];

const WIDE_FLOW_ART = [
  '███████ ██       █████  ██   ██',
  '██      ██      ██   ██ ██   ██',
  '██████  ██      ██   ██ ██ █ ██',
  '██      ██      ██   ██ ███ ███',
  '██      ███████  █████   ██ ██ ',
];

const WIDE_CONNECTOR = [
  '             ',
  '             ',
  '    ━━◆━━    ',
  '             ',
  '             ',
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

interface RGB {
  red: number;
  green: number;
  blue: number;
}

export interface BannerOptions {
  columns?: number;
  color?: boolean;
}

const CYAN: RGB = { red: 84, green: 214, blue: 255 };
const GOLD: RGB = { red: 246, green: 200, blue: 95 };
const VIOLET: RGB = { red: 167, green: 139, blue: 250 };
const PINK: RGB = { red: 244, green: 114, blue: 182 };
const MUTED: RGB = { red: 148, green: 163, blue: 184 };

function foreground(color: RGB): string {
  return `\u001b[38;2;${color.red};${color.green};${color.blue}m`;
}

function solid(text: string, color: RGB, enabled: boolean): string {
  return enabled ? `${foreground(color)}${text}${RESET}` : text;
}

function interpolate(start: number, end: number, ratio: number): number {
  return Math.round(start + ((end - start) * ratio));
}

function gradient(text: string, start: RGB, end: RGB, enabled: boolean): string {
  if (!enabled) return text;
  const visible = [...text].filter(character => character !== ' ').length;
  let index = 0;
  return [...text].map(character => {
    if (character === ' ') return character;
    const ratio = visible <= 1 ? 0 : index / (visible - 1);
    index += 1;
    return foreground({
      red: interpolate(start.red, end.red, ratio),
      green: interpolate(start.green, end.green, ratio),
      blue: interpolate(start.blue, end.blue, ratio),
    }) + character;
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
    const logo = WIDE_OMP_ART.map((ompLine, index) => [
      solid(ompLine, CYAN, color),
      solid(WIDE_CONNECTOR[index], GOLD, color),
      gradient(WIDE_FLOW_ART[index], VIOLET, PINK, color),
    ].join(''));

    return [
      ...logo,
      solid('          agent-native workflow orchestration', MUTED, color),
    ].join('\n');
  }

  const logo = OMP_ART.map((ompLine, index) => [
    solid(ompLine, CYAN, color),
    solid(CONNECTOR[index], GOLD, color),
    gradient(FLOW_ART[index], VIOLET, PINK, color),
  ].join(''));

  return [
    ...logo,
    solid('          agent-native workflow orchestration', MUTED, color),
  ].join('\n');
}
