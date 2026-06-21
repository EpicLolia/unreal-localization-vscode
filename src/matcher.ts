import * as vscode from 'vscode';
import { PatternConfig } from './config';
import { log } from './log';

export interface Match {
  ns: string;
  key: string;
  fullRange: vscode.Range;
  nsRange: vscode.Range;
  keyRange: vscode.Range;
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
        regex = new RegExp(p.regex, 'gd');
      } catch (err) {
        const msg = `Pattern "${p.name}" has invalid regex: ${(err as Error).message}`;
        log.warn(msg);
        void vscode.window.showWarningMessage(`[unreal-localization] ${msg}`);
        continue;
      }
      if (!regex.source.includes('?<ns>') || !regex.source.includes('?<key>')) {
        const msg = `Pattern "${p.name}" must define both (?<ns>...) and (?<key>...) named groups; skipped.`;
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
        if (!groups?.ns || !groups.key) continue;
        const start = m.index ?? 0;
        out.push({
          ns: m.groups?.ns ?? '',
          key: m.groups?.key ?? '',
          fullRange: new vscode.Range(doc.positionAt(start), doc.positionAt(start + m[0].length)),
          nsRange: new vscode.Range(doc.positionAt(groups.ns[0]), doc.positionAt(groups.ns[1])),
          keyRange: new vscode.Range(doc.positionAt(groups.key[0]), doc.positionAt(groups.key[1])),
        });
      }
    }
    return out;
  }

  findAtPosition(doc: vscode.TextDocument, pos: vscode.Position): { match: Match; slot: 'ns' | 'key' | 'full' } | undefined {
    for (const m of this.findAll(doc)) {
      if (!m.fullRange.contains(pos)) continue;
      if (containsInclusive(m.nsRange, pos)) return { match: m, slot: 'ns' };
      if (containsInclusive(m.keyRange, pos)) return { match: m, slot: 'key' };
      return { match: m, slot: 'full' };
    }
    return undefined;
  }
}

function containsInclusive(range: vscode.Range, pos: vscode.Position): boolean {
  return !pos.isBefore(range.start) && !pos.isAfter(range.end);
}
