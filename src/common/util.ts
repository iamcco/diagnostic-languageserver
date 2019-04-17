import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import findup from 'findup';
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

// cover cb type async function to promise
export function pcb(
  cb: (...args: any[]) => void,
): (...args: any[]) => Promise<any> {
  return function(...args: any[]): Promise<any> {
    return new Promise((resolve) => {
      cb(...args, function(...args: any[]) {
        resolve(args)
      })
    })
  }
}

// find work dirname by root patterns
export async function findWorkDirectory(
  filePath: string,
  rootPatterns: string | string[]
): Promise<string> {
  const dirname = path.dirname(filePath)
  let patterns = [].concat(rootPatterns)
  for (const pattern of patterns) {
    const [err, dir] =  await pcb(findup)(dirname, pattern)
    if (!err && dir && dir !== '/') {
      return dir
    }
  }
  return dirname
}

export async function findCommand(command: string, workDir: string) {
  if (/^(\.\.|\.)/.test(command)) {
    let cmd = path.join(workDir, command)
    if (fs.existsSync(cmd)) {
      return command
    }
    return path.basename(cmd)
  }
  return command
}
