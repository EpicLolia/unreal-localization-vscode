import * as vscode from 'vscode';
import { getConfig, onDidChangeConfig } from './config';
import { LocresStore } from './store';
import { PatternMatcher } from './matcher';
import { registerCompletion } from './providers/completion';
import { registerHover } from './providers/hover';
import { DiagnosticsManager } from './providers/diagnostics';
import { registerSearch } from './providers/search';
import { channel, log } from './log';

export function activate(context: vscode.ExtensionContext): void {
  log.info('extension activated');

  const store = new LocresStore();
  const matcher = new PatternMatcher();

  const apply = (): void => {
    matcher.setPatterns(getConfig().patterns);
    store.reload();
  };

  context.subscriptions.push(
    channel,
    store,
    onDidChangeConfig(() => {
      log.info('config changed');
      apply();
    }),
    registerCompletion(matcher, store),
    registerHover(matcher, store),
    new DiagnosticsManager(matcher, store),
    registerSearch(store),
    vscode.commands.registerCommand('unreal-localization.reload', () => {
      log.info('manual reload');
      store.reload();
      void vscode.window.showInformationMessage('Unreal Localization: locres reloaded.');
    }),
  );

  apply();
}

export function deactivate(): void {
  // disposables released via context.subscriptions
}
