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
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let error: Error
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

    cp.on('error', (err: Error) => {
      error = err
      reject(error)
    })

    cp.on('close', (code) => {
      if (!error) {
        resolve({ code, stdout, stderr })
      }
    });

    // error will occur when cp get error
    if (!isPassAsText) {
      input.pipe(cp.stdin).on('error', () => {})
    }

  })
}
