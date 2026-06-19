import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, ResolvedConfig } from './config';
import { parseLocres, LocresTable } from './locres/parser';

export class LocresStore implements vscode.Disposable {
  private table: LocresTable = {};
  private namespaceList: string[] = [];
  private watchers: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<void>();
  public readonly onDidUpdate = this.emitter.event;

  reload(): void {
    const cfg = getConfig();
    const merged: LocresTable = {};
    for (const filePath of this.resolveLocresPaths(cfg)) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const { table } = parseLocres(filePath);
        for (const [ns, entries] of Object.entries(table)) {
          if (!merged[ns]) {
            merged[ns] = { ...entries };
          } else {
            for (const [k, v] of Object.entries(entries)) {
              if (merged[ns][k] !== undefined && merged[ns][k] !== v) {
                console.warn(`[unreal-localization] Conflicting key '${ns}.${k}' from ${filePath}; later value wins.`);
              }
              merged[ns][k] = v;
            }
          }
        }
      } catch (err) {
        console.warn(`[unreal-localization] Failed to parse locres at ${filePath}:`, err);
      }
    }
    this.table = merged;
    this.namespaceList = Object.keys(merged);
    this.rebuildWatchers(cfg);
    this.emitter.fire();
  }

  private resolveLocresPaths(cfg: ResolvedConfig): string[] {
    const rel = path.join(cfg.target, cfg.defaultCulture, `${cfg.target}.locres`);
    if (path.isAbsolute(cfg.root)) {
      return [path.join(cfg.root, rel)];
    }
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.map((f) => path.join(f.uri.fsPath, cfg.root, rel));
  }

  private rebuildWatchers(cfg: ResolvedConfig): void {
    this.disposeWatchers();
    const folders = vscode.workspace.workspaceFolders ?? [];
    const fileGlob = `${cfg.target}/${cfg.defaultCulture}/${cfg.target}.locres`;
    if (path.isAbsolute(cfg.root)) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(cfg.root), fileGlob));
      const handler = () => this.reload();
      watcher.onDidChange(handler);
      watcher.onDidCreate(handler);
      watcher.onDidDelete(handler);
      this.watchers.push(watcher);
    } else {
      for (const folder of folders) {
        const pattern = new vscode.RelativePattern(folder, `${cfg.root}/${fileGlob}`);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const handler = () => this.reload();
        watcher.onDidChange(handler);
        watcher.onDidCreate(handler);
        watcher.onDidDelete(handler);
        this.watchers.push(watcher);
      }
    }
  }

  private disposeWatchers(): void {
    for (const w of this.watchers) w.dispose();
    this.watchers = [];
  }

  hasNamespace(ns: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.table, ns);
  }

  hasKey(ns: string, key: string): boolean {
    const entries = this.table[ns];
    return !!entries && Object.prototype.hasOwnProperty.call(entries, key);
  }

  getTranslation(ns: string, key: string): string | undefined {
    return this.table[ns]?.[key];
  }

  listNamespaces(): string[] {
    return this.namespaceList;
  }

  listKeys(ns: string): string[] {
    const entries = this.table[ns];
    return entries ? Object.keys(entries) : [];
  }

  keyCount(ns: string): number {
    return Object.keys(this.table[ns] ?? {}).length;
  }

  dispose(): void {
    this.disposeWatchers();
    this.emitter.dispose();
  }
}
