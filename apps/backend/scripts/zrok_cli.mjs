import { existsSync } from 'node:fs';

const WINDOWS_ZROK_CANDIDATES = ['C:\\zrok\\zrok2.exe', 'C:\\zrok\\zrok.exe'];

export function getZrokCommand() {
  const configuredPath = process.env.ZROK_PATH?.trim();

  if (configuredPath) {
    return configuredPath;
  }

  for (const candidate of WINDOWS_ZROK_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return 'zrok';
}

export function getZrokDisplayCommand(command) {
  return command.includes(' ') ? `"${command}"` : command;
}
