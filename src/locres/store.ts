import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, ResolvedConfig } from '../common/config';
import { parseLocres, LocresTable } from './parser';
import { log } from '../common/log';

export class LocresStore implements vscode.Disposable {
  private table: LocresTable = {};
  private watchers: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<void>();
  public readonly onDidUpdate = this.emitter.event;

  reload(): void {
    const cfg = getConfig();
    const bases = resolveBases(cfg);
    log.info(`reload: culture=${cfg.defaultCulture}, bases=${JSON.stringify(bases)}`);

    const merged: LocresTable = {};
    for (const base of bases) {
      const cultureDir = path.join(base, cfg.defaultCulture);
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(cultureDir, { withFileTypes: true });
      } catch (err) {
        log.info(`skip (not readable): ${cultureDir} (${(err as Error).message})`);
        continue;
      }
      const files = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.locres')).map((e) => path.join(cultureDir, e.name));
      if (files.length === 0) {
        log.info(`skip (no .locres): ${cultureDir}`);
        continue;
      }
      for (const filePath of files) {
        try {
          const { table, namespaceCount, stringsCount } = parseLocres(filePath);
          for (const [ns, kv] of Object.entries(table)) {
            merged[ns] = { ...(merged[ns] ?? {}), ...kv };
          }
          log.info(`loaded: ${filePath} (${namespaceCount} namespaces, ${stringsCount} strings)`);
        } catch (err) {
          log.error(`failed to parse ${filePath}: ${(err as Error).message}`);
        }
      }
    }
    this.table = merged;

    this.disposeWatchers();
    for (const base of bases) {
      const pattern = new vscode.RelativePattern(vscode.Uri.file(base), `${cfg.defaultCulture}/*.locres`);
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
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
  const folders = vscode.workspace.workspaceFolders ?? [];
  const out: string[] = [];
  for (const p of cfg.paths) {
    if (path.isAbsolute(p)) {
      out.push(p);
    } else {
      for (const f of folders) out.push(path.join(f.uri.fsPath, p));
    }
  }
  return out;
}
