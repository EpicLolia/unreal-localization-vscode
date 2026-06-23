import * as vscode from 'vscode';
import { LocresStore } from '../store';

interface Item extends vscode.QuickPickItem {
  ns: string;
  key: string;
}

export function registerSearch(store: LocresStore): vscode.Disposable {
  return vscode.commands.registerCommand('unreal-localization.search', () => {
    const items: Item[] = [];
    for (const { ns, key, value } of store.entries()) {
      items.push({
        ns,
        key,
        label: `${ns}, ${key}`,
        description: value.replace(/\s+/g, ' ').trim(),
      });
    }
    if (items.length === 0) {
      void vscode.window.showInformationMessage('Unreal Localization: no entries loaded.');
      return;
    }

    const picker = vscode.window.createQuickPick<Item>();
    picker.items = items;
    picker.matchOnDescription = true;
    picker.placeholder = `Search ${items.length} entries by namespace, key, or translation`;
    picker.onDidHide(() => picker.dispose());
    picker.onDidAccept(async () => {
      const [chosen] = picker.selectedItems;
      picker.hide();
      if (chosen) {
        const text = `${chosen.ns}, ${chosen.key}`;
        await vscode.env.clipboard.writeText(text);
        void vscode.window.showInformationMessage(`Copied: ${text}`);
      }
    });
    picker.show();
  });
}
