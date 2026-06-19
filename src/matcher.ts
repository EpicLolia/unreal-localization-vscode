import * as vscode from 'vscode';
import { PatternConfig } from './config';

export interface CompiledPattern {
  name: string;
  regex: RegExp;
  selector: vscode.DocumentSelector;
  files: string[];
}

export interface Match {
  patternName: string;
  ns: string;
  key: string;
  fullRange: vscode.Range;
  nsRange: vscode.Range;
  keyRange: vscode.Range;
}

export type Slot = 'ns' | 'key' | 'full';

export interface PositionHit {
  match: Match;
  slot: Slot;
}

interface IndicesArrayLike {
  groups?: Record<string, [number, number] | undefined>;
}

interface CacheEntry {
  uri: string;
  version: number;
  patternsRev: number;
  matches: Match[];
}

export class PatternMatcher {
  private compiled: CompiledPattern[] = [];
  private patternsRev = 0;
  private warnedOnce = new Set<string>();
  private readonly cache: CacheEntry[] = [];
  private static readonly CACHE_LIMIT = 16;

  compile(patterns: PatternConfig[]): void {
    const next: CompiledPattern[] = [];
    for (const p of patterns) {
      let regex: RegExp;
      try {
        regex = new RegExp(p.regex, 'gd');
      } catch (err) {
        this.warnOnce(`pattern-syntax:${p.name}`, `Pattern "${p.name}" has invalid regex: ${(err as Error).message}`);
        continue;
      }
      const dummy = '';
      // probe whether named groups exist
      const probe = regex.exec(dummy);
      void probe;
      regex.lastIndex = 0;
      // Cheap structural check: source must reference (?<ns> and (?<key>
      if (!/\(\?<ns>/.test(p.regex) || !/\(\?<key>/.test(p.regex)) {
        this.warnOnce(`pattern-groups:${p.name}`, `Pattern "${p.name}" must define both (?<ns>...) and (?<key>...) named groups; skipped.`);
        continue;
      }
      const selector: vscode.DocumentSelector = (p.files ?? []).map((g) => ({ scheme: 'file', pattern: g }));
      next.push({ name: p.name, regex, selector, files: p.files ?? [] });
    }
    this.compiled = next;
    this.patternsRev += 1;
    this.cache.length = 0;
  }

  hasPatterns(): boolean {
    return this.compiled.length > 0;
  }

  /** Document selector covering the union of all configured patterns. */
  combinedSelector(): vscode.DocumentSelector {
    const acc: vscode.DocumentFilter[] = [];
    for (const p of this.compiled) {
      for (const f of p.files) acc.push({ scheme: 'file', pattern: f });
    }
    return acc.length > 0 ? acc : [{ scheme: 'file' }];
  }

  findAll(doc: vscode.TextDocument): Match[] {
    const cached = this.lookupCache(doc);
    if (cached) return cached;

    const text = doc.getText();
    const matches: Match[] = [];
    for (const p of this.compiled) {
      if (vscode.languages.match(p.selector, doc) === 0) continue;
      p.regex.lastIndex = 0;
      for (const m of text.matchAll(p.regex)) {
        const indices = (m as RegExpExecArray & { indices?: [number, number][] & IndicesArrayLike }).indices;
        if (!indices?.groups) continue;
        const nsIdx = indices.groups.ns;
        const keyIdx = indices.groups.key;
        if (!nsIdx || !keyIdx) continue;
        const start = m.index ?? 0;
        const end = start + m[0].length;
        matches.push({
          patternName: p.name,
          ns: m.groups?.ns ?? '',
          key: m.groups?.key ?? '',
          fullRange: new vscode.Range(doc.positionAt(start), doc.positionAt(end)),
          nsRange: new vscode.Range(doc.positionAt(nsIdx[0]), doc.positionAt(nsIdx[1])),
          keyRange: new vscode.Range(doc.positionAt(keyIdx[0]), doc.positionAt(keyIdx[1])),
        });
      }
    }
    this.storeCache(doc, matches);
    return matches;
  }

  findAtPosition(doc: vscode.TextDocument, pos: vscode.Position): PositionHit | undefined {
    for (const m of this.findAll(doc)) {
      if (!m.fullRange.contains(pos)) continue;
      // Treat the right edge of ns/key range as "inside" so completion fires when cursor sits at the closing quote.
      if (this.rangeContainsInclusive(m.nsRange, pos)) return { match: m, slot: 'ns' };
      if (this.rangeContainsInclusive(m.keyRange, pos)) return { match: m, slot: 'key' };
      return { match: m, slot: 'full' };
    }
    return undefined;
  }

  private rangeContainsInclusive(range: vscode.Range, pos: vscode.Position): boolean {
    return !pos.isBefore(range.start) && !pos.isAfter(range.end);
  }

  private lookupCache(doc: vscode.TextDocument): Match[] | undefined {
    const uri = doc.uri.toString();
    for (let i = 0; i < this.cache.length; i++) {
      const e = this.cache[i];
      if (e.uri === uri && e.version === doc.version && e.patternsRev === this.patternsRev) {
        if (i > 0) {
          this.cache.splice(i, 1);
          this.cache.unshift(e);
        }
        return e.matches;
      }
    }
    return undefined;
  }

  private storeCache(doc: vscode.TextDocument, matches: Match[]): void {
    const entry: CacheEntry = {
      uri: doc.uri.toString(),
      version: doc.version,
      patternsRev: this.patternsRev,
      matches,
    };
    this.cache.unshift(entry);
    if (this.cache.length > PatternMatcher.CACHE_LIMIT) {
      this.cache.length = PatternMatcher.CACHE_LIMIT;
    }
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warnedOnce.has(key)) return;
    this.warnedOnce.add(key);
    void vscode.window.showWarningMessage(`[unreal-localization] ${msg}`);
  }
}
