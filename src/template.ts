// Compiles a call-shape template (e.g. "GetText('<ns>', '<key>')") into a lenient
// RegExp. Whitespace is auto-injected between structural tokens, so the resulting
// regex tolerates linebreaks and extra spacing in the actual source. Each step
// after <ns> is its own optional cascade level so completion can fire mid-typing.

type Token =
  | { kind: 'word'; text: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }
  | { kind: 'quote' }
  | { kind: 'ns' }
  | { kind: 'key' };

function isWordChar(s: string, j: number): boolean {
  return !/[\s(),'"]/.test(s[j]) && !s.startsWith('<ns>', j) && !s.startsWith('<key>', j);
}

function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (template.startsWith('<ns>', i)) {
      tokens.push({ kind: 'ns' });
      i += 4;
    } else if (template.startsWith('<key>', i)) {
      tokens.push({ kind: 'key' });
      i += 5;
    } else if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
    } else if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
    } else if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i++;
    } else if (ch === "'" || ch === '"') {
      tokens.push({ kind: 'quote' });
      i++;
    } else {
      let j = i;
      while (j < template.length && isWordChar(template, j)) j++;
      tokens.push({ kind: 'word', text: template.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

const REGEX_SPECIALS = /[\\^$.|?*+()[\]{}]/g;

function regexEscape(s: string): string {
  return s.replace(REGEX_SPECIALS, '\\$&');
}

function emitToken(t: Token): string {
  switch (t.kind) {
    case 'word':
      return regexEscape(t.text);
    case 'lparen':
      return '\\(';
    case 'rparen':
      return '\\)';
    case 'comma':
      return ',';
    case 'quote':
      return `['"]`;
    case 'ns':
      return `(?<ns>[^'"\\r\\n]*)`;
    case 'key':
      return `(?<key>[^'"\\r\\n]*)`;
  }
}

// Insert `\s*` between two tokens unless they're both words or one is a
// placeholder adjacent to its own quote (i.e., we're inside the string literal).
function needsGap(prev: Token, curr: Token): boolean {
  const isPlaceholder = (t: Token): boolean => t.kind === 'ns' || t.kind === 'key';
  if (isPlaceholder(prev) && curr.kind === 'quote') return false;
  if (prev.kind === 'quote' && isPlaceholder(curr)) return false;
  if (prev.kind === 'word' && curr.kind === 'word') return false;
  return true;
}

export function compileTemplate(template: string): RegExp {
  const tokens = tokenize(template);

  const nsIdx = tokens.findIndex((t) => t.kind === 'ns');
  if (nsIdx < 0) throw new Error('template missing <ns> placeholder');
  const keyIdx = tokens.findIndex((t, i) => i > nsIdx && t.kind === 'key');
  if (keyIdx < 0) throw new Error('template missing <key> placeholder (must come after <ns>)');

  // Strict shape: '<ns>', '<key>'  (closing ')' optional)
  const expect = (idx: number, kind: Token['kind'], msg: string): void => {
    if (tokens[idx]?.kind !== kind) throw new Error(msg);
  };
  expect(nsIdx - 1, 'quote', '<ns> must be wrapped in quotes');
  expect(nsIdx + 1, 'quote', '<ns> must be wrapped in quotes');
  expect(nsIdx + 2, 'comma', "template must have ',' between <ns> and <key>");
  expect(nsIdx + 3, 'quote', '<key> must be wrapped in quotes');
  if (keyIdx !== nsIdx + 4) throw new Error('<key> must follow the comma + quote after <ns>');
  expect(keyIdx + 1, 'quote', '<key> must be wrapped in quotes');

  const rparenIdx = tokens[keyIdx + 2]?.kind === 'rparen' ? keyIdx + 2 : -1;
  const tailStart = rparenIdx >= 0 ? rparenIdx + 1 : keyIdx + 2;
  if (tokens.length > tailStart) throw new Error('template must end at the closing `)`');

  // Cascade open points (each cascade wraps ONE structural step):
  //   nsIdx + 1 — ns close quote
  //   nsIdx + 2 — comma + open key quote + key content
  //   keyIdx + 1 — key close quote
  //   rparenIdx — close paren
  let out = '';
  let cascades = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (i === nsIdx + 1) {
      out += '(?:';
      cascades++;
    }
    if (i === nsIdx + 2) {
      out += '(?:';
      cascades++;
    }
    if (i === keyIdx + 1) {
      out += '(?:';
      cascades++;
    }
    if (rparenIdx >= 0 && i === rparenIdx) {
      out += '(?:';
      cascades++;
    }
    if (i > 0 && needsGap(tokens[i - 1], tokens[i])) {
      out += '\\s*';
    }
    out += emitToken(tokens[i]);
  }
  out += ')?'.repeat(cascades);

  return new RegExp(out, 'gd');
}
