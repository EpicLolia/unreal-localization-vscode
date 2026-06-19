const { execSync } = require('child_process');
const os = require('os');

const title = 'Claude Code';
const message = 'Claude Code needs your attention';

try {
  switch (os.platform()) {
    case 'win32':
      execSync(
        `powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.BalloonTipTitle = '${title}'; $n.BalloonTipText = '${message}'; $n.BalloonTipIcon = 'Info'; $n.ShowBalloonTip(10000)"`,
      );
      break;
    case 'darwin':
      execSync(`osascript -e 'display notification "${message}" with title "${title}"'`);
      break;
    default:
      break;
  }
} catch {
  // Silently ignore notification failures to avoid blocking Claude Code
}
