import { exec } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { LcuCredentials } from '../types/lcu.js';

const execAsync = promisify(exec);

// Standard Riot Games install locations on Windows
const DEFAULT_CANDIDATE_DIRS = [
  'C:\\Riot Games\\League of Legends',
  'D:\\Riot Games\\League of Legends',
  'E:\\Riot Games\\League of Legends',
  'F:\\Riot Games\\League of Legends',
];

/**
 * Attempts to extract credentials from a Riot lockfile.
 * Lockfile format: `ProcessName:PID:Port:Password:Protocol`
 * Example: `LeagueClient:1234:52882:abc123token:https`
 */
export function readLockfile(lockfilePath: string): LcuCredentials | null {
  try {
    if (!existsSync(lockfilePath)) return null;

    const content = readFileSync(lockfilePath, 'utf8').trim();
    if (!content) return null;

    const parts = content.split(':');
    if (parts.length < 5) return null;

    const [name, pidStr, portStr, token, protocol] = parts;
    const port = parseInt(portStr, 10);
    const pid = parseInt(pidStr, 10);

    if (isNaN(port) || isNaN(pid) || !token) {
      return null;
    }

    return {
      port,
      token,
      protocol: protocol.toLowerCase() === 'http' ? 'http' : 'https',
      pid,
      source: 'lockfile',
    };
  } catch (error) {
    return null;
  }
}

/**
 * Inspects Windows processes to extract `--app-port` and `--remoting-auth-token`
 * from the running `LeagueClientUx.exe` command line.
 */
export async function getCredentialsFromProcess(): Promise<LcuCredentials | null> {
  // Use PowerShell CIM to inspect process command line
  const psCommand = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'LeagueClientUx.exe'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"`;

  try {
    const { stdout } = await execAsync(psCommand, { windowsHide: true, timeout: 5000 });
    if (!stdout || !stdout.trim()) return null;

    let jsonParsed: any;
    try {
      jsonParsed = JSON.parse(stdout.trim());
    } catch {
      // If multiple instances or raw text
      jsonParsed = null;
    }

    let cmdLine = '';
    let pid = 0;

    if (Array.isArray(jsonParsed) && jsonParsed.length > 0) {
      cmdLine = jsonParsed[0].CommandLine || '';
      pid = jsonParsed[0].ProcessId || 0;
    } else if (jsonParsed && typeof jsonParsed === 'object') {
      cmdLine = jsonParsed.CommandLine || '';
      pid = jsonParsed.ProcessId || 0;
    } else {
      // Raw string fallback
      cmdLine = stdout;
    }

    const portMatch = cmdLine.match(/--app-port=([0-9]+)/);
    const tokenMatch = cmdLine.match(/--remoting-auth-token=([a-zA-Z0-9_\-]+)/);

    if (portMatch && tokenMatch) {
      const port = parseInt(portMatch[1], 10);
      const token = tokenMatch[1];
      return {
        port,
        token,
        protocol: 'https',
        pid: pid || 0,
        source: 'process',
      };
    }
  } catch (err) {
    // If PowerShell CIM fails, try WMIC fallback
    try {
      const { stdout: wmicOut } = await execAsync(
        'wmic PROCESS WHERE name="LeagueClientUx.exe" GET CommandLine,ProcessId /VALUE',
        { windowsHide: true, timeout: 5000 }
      );

      const portMatch = wmicOut.match(/--app-port=([0-9]+)/);
      const tokenMatch = wmicOut.match(/--remoting-auth-token=([a-zA-Z0-9_\-]+)/);
      const pidMatch = wmicOut.match(/ProcessId=([0-9]+)/);

      if (portMatch && tokenMatch) {
        return {
          port: parseInt(portMatch[1], 10),
          token: tokenMatch[1],
          protocol: 'https',
          pid: pidMatch ? parseInt(pidMatch[1], 10) : 0,
          source: 'process',
        };
      }
    } catch {
      // WMIC also failed or process not found
    }
  }

  return null;
}

/**
 * Combined discovery: tries custom path, candidate lockfiles, and process table.
 */
export async function discoverLcuCredentials(customLockfilePath?: string): Promise<LcuCredentials | null> {
  // 1. Check custom path if provided in config / env
  if (customLockfilePath) {
    const creds = readLockfile(customLockfilePath);
    if (creds) return creds;
  }

  // 2. Check candidate standard directories
  for (const dir of DEFAULT_CANDIDATE_DIRS) {
    const lockPath = join(dir, 'lockfile');
    const creds = readLockfile(lockPath);
    if (creds) return creds;
  }

  // 3. Fallback to process inspection
  const procCreds = await getCredentialsFromProcess();
  if (procCreds) return procCreds;

  return null;
}
