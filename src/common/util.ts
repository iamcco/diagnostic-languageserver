import {
  TextDocument,
} from 'vscode-languageserver';
import VscUri from 'vscode-uri';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import findup from 'findup';
import { SpawnOptions, spawn } from 'child_process';

export function executeFile(
  input: Readable,
  textDocument: TextDocument,
  command: string,
  args?: any[],
  option?: SpawnOptions
): Promise<{
  code: number,
  stdout: string,
  stderr: string
}> {
  return new Promise((resolve, reject) => {
    const fpath = VscUri.parse(textDocument.uri).fsPath

    let stdout = ''
    let stderr = ''
    let error: Error
    let notUsePip = false

    args = (args || []).map(arg => {
      if (/%text/.test(arg)) {
        notUsePip = true
        return arg.replace(/%text/g, input.toString())
      }
      if (/%filepath/.test(arg)) {
        return arg.replace(/%filepath/g, fpath)
      }
      if (/%filename/.test(arg)) {
        return arg.replace(/%filename/g, path.basename(fpath))
      }
      if (/%file/.test(arg)) {
        notUsePip = true
        return arg.replace(/%file/g, fpath)
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
    if (!notUsePip) {
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

export function checkAnyFileExists(workDir: string, testPaths: string[]) {
  for (const testPath of testPaths) {
    if (fs.existsSync(path.join(workDir , testPath))) {
      return true
    }
  }

  return false
}