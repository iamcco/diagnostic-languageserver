import { Readable } from 'stream';
import { SpawnOptions, spawn } from 'child_process';

export function executeFile(
  input: Readable,
  command: string,
  args?: any[],
  option?: SpawnOptions
): Promise<{
  code: number,
  stdout: string,
  stderr: string
}> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    const cp = spawn(command,  args, option);

    cp.stdout.on('data', (data) => {
      stdout += data
    });

    cp.stderr.on('data', (data) => {
      stderr += data
    });

    cp.on('close', (code) => {
      resolve({ code, stdout, stderr })
    });

    input.pipe(cp.stdin)
  })
}
