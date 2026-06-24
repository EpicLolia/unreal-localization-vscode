import * as vscode from 'vscode';
import { PatternConfig } from './config';
import { compileTemplate } from './template';
import { log } from './log';

export interface Match {
  ns: string;
  key: string;
  nsRange: vscode.Range;
  keyRange?: vscode.Range;
  fullRange: vscode.Range;
  complete: boolean;
}

interface CompiledPattern {
  regex: RegExp;
  selector: vscode.DocumentSelector;
}

export class PatternMatcher {
  private patterns: CompiledPattern[] = [];

  setPatterns(configs: PatternConfig[]): void {
    const next: CompiledPattern[] = [];
    for (const p of configs) {
      let regex: RegExp;
      try {
        regex = compileTemplate(p.template);
      } catch (err) {
        const msg = `Pattern template invalid (${p.template}): ${(err as Error).message}`;
        log.warn(msg);
        void vscode.window.showWarningMessage(`[unreal-localization] ${msg}`);
        continue;
      }
      const selector = (p.files ?? []).map((g) => ({ pattern: g }));
      next.push({ regex, selector });
    }
    this.patterns = next;
    log.info(`patterns set: ${next.length} active`);
  }

  findAll(doc: vscode.TextDocument): Match[] {
    const text = doc.getText();
    const out: Match[] = [];
    for (const { regex, selector } of this.patterns) {
      if (vscode.languages.match(selector, doc) === 0) continue;
      for (const m of text.matchAll(regex)) {
        const groups = m.indices?.groups;
        if (!groups?.ns) continue;
        const start = m.index ?? 0;
        const nsEnd = groups.ns[1];
        const nsClosed = isQuote(text[nsEnd]);
        let keyRange: vscode.Range | undefined;
        let keyClosed = false;
        if (groups.key) {
          const keyEnd = groups.key[1];
          keyRange = new vscode.Range(doc.positionAt(groups.key[0]), doc.positionAt(keyEnd));
          keyClosed = isQuote(text[keyEnd]);
        }
        out.push({
          ns: m.groups?.ns ?? '',
          key: m.groups?.key ?? '',
          nsRange: new vscode.Range(doc.positionAt(groups.ns[0]), doc.positionAt(nsEnd)),
          keyRange,
          fullRange: new vscode.Range(doc.positionAt(start), doc.positionAt(start + m[0].length)),
          complete: nsClosed && keyClosed,
        });
      }
    }
    return out;
  }

  findAtPosition(doc: vscode.TextDocument, pos: vscode.Position): { match: Match; slot: 'ns' | 'key' | 'full' } | undefined {
    for (const m of this.findAll(doc)) {
      if (!containsInclusive(m.fullRange, pos)) continue;
      if (m.keyRange && containsInclusive(m.keyRange, pos)) return { match: m, slot: 'key' };
      if (containsInclusive(m.nsRange, pos)) return { match: m, slot: 'ns' };
      return { match: m, slot: 'full' };
    }
    return undefined;
  }
}

function isQuote(ch: string | undefined): boolean {
  return ch === "'" || ch === '"';
}

function containsInclusive(range: vscode.Range, pos: vscode.Position): boolean {
  return !pos.isBefore(range.start) && !pos.isAfter(range.end);
}
