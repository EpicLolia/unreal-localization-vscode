import * as vscode from 'vscode';
import { getConfig, onDidChangeConfig } from './config';
import { LocresStore } from './store';
import { PatternMatcher } from './matcher';
import { registerCompletion } from './providers/completion';
import { registerHover } from './providers/hover';
import { DiagnosticsManager } from './providers/diagnostics';

interface ProviderHandles {
  completion: vscode.Disposable;
  hover: vscode.Disposable;
  diagnostics: DiagnosticsManager;
}

export function activate(context: vscode.ExtensionContext): void {
  const store = new LocresStore();
  const matcher = new PatternMatcher();

  let providers: ProviderHandles | undefined;

  const setupProviders = (): void => {
    providers?.completion.dispose();
    providers?.hover.dispose();
    providers?.diagnostics.dispose();
    matcher.compile(getConfig().patterns);
    const diagnostics = new DiagnosticsManager(matcher, store);
    providers = {
      completion: registerCompletion(matcher, store),
      hover: registerHover(matcher, store),
      diagnostics,
    };
    diagnostics.refreshAll();
  };

  setupProviders();
  store.reload();

  context.subscriptions.push(
    store,
    onDidChangeConfig(() => {
      setupProviders();
      store.reload();
    }),
    vscode.commands.registerCommand('unreal-localization.reload', () => {
      store.reload();
      void vscode.window.showInformationMessage('Unreal Localization: locres reloaded.');
    }),
    {
      dispose() {
        providers?.completion.dispose();
        providers?.hover.dispose();
        providers?.diagnostics.dispose();
      },
    },
  );
}

export function deactivate(): void {
  // disposables released via context.subscriptions
}
