import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, ResolvedConfig } from './config';
import { parseLocres, LocresTable } from './locres/parser';
import { log } from './log';

export class LocresStore implements vscode.Disposable {
  private table: LocresTable = {};
  private watchers: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<void>();
  public readonly onDidUpdate = this.emitter.event;

  reload(): void {
    const cfg = getConfig();
    const bases = resolveBases(cfg);
    const rel = path.join(cfg.target, cfg.defaultCulture, `${cfg.target}.locres`);
    log.info(`reload: culture=${cfg.defaultCulture}, target=${cfg.target}, bases=${JSON.stringify(bases)}`);

    const merged: LocresTable = {};
    for (const base of bases) {
      const filePath = path.join(base, rel);
      if (!fs.existsSync(filePath)) {
        log.info(`skip (not found): ${filePath}`);
        continue;
      }
      try {
        const { table, namespaceCount, stringsCount } = parseLocres(filePath);
        for (const [ns, entries] of Object.entries(table)) {
          merged[ns] = { ...(merged[ns] ?? {}), ...entries };
        }
        log.info(`loaded: ${filePath} (${namespaceCount} namespaces, ${stringsCount} strings)`);
      } catch (err) {
        log.error(`failed to parse ${filePath}: ${(err as Error).message}`);
      }
    }
    this.table = merged;

    this.disposeWatchers();
    for (const base of bases) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(base), rel));
      const reload = () => this.reload();
      watcher.onDidChange(reload);
      watcher.onDidCreate(reload);
      watcher.onDidDelete(reload);
      this.watchers.push(watcher);
    }

    this.emitter.fire();
  }

  hasNamespace(ns: string): boolean {
    return ns in this.table;
  }

  hasKey(ns: string, key: string): boolean {
    return key in (this.table[ns] ?? {});
  }

  getTranslation(ns: string, key: string): string | undefined {
    return this.table[ns]?.[key];
  }

  listNamespaces(): string[] {
    return Object.keys(this.table);
  }

  listKeys(ns: string): string[] {
    return Object.keys(this.table[ns] ?? {});
  }

  *entries(): Iterable<{ ns: string; key: string; value: string }> {
    for (const [ns, kv] of Object.entries(this.table)) {
      for (const [key, value] of Object.entries(kv)) {
        yield { ns, key, value };
      }
    }
  }

  dispose(): void {
    this.disposeWatchers();
    this.emitter.dispose();
  }

  private disposeWatchers(): void {
    for (const w of this.watchers) w.dispose();
    this.watchers = [];
  }
}

function resolveBases(cfg: ResolvedConfig): string[] {
  if (path.isAbsolute(cfg.root)) return [cfg.root];
  return (vscode.workspace.workspaceFolders ?? []).map((f) => path.join(f.uri.fsPath, cfg.root));
}
