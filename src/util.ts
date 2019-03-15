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
    let isPassAsText = false

    args = (args || []).map(arg => {
      if (/%text/.test(arg)) {
        isPassAsText = true
        return arg.replace(/%text/g, input.toString())
      }
      return arg
    })

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

    if (!isPassAsText) {
      input.pipe(cp.stdin)
    }
  })
}
