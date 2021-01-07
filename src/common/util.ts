import {
  TextDocument,
} from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import findUp from 'find-up';
import { SpawnOptions, spawn } from 'child_process';
import tempy from 'tempy';
import del from 'del';
import logger from './logger';

export async function executeFile(
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
  const fpath = URI.parse(textDocument.uri).fsPath

  let usePipe = true
  let tempFilename: string | undefined;

  args = await Promise.all((args || []).map(async arg => {
    if (/%text/.test(arg)) {
      usePipe = false
      return arg.replace(/%text/g, input.toString())
    }
    if (/%filepath/.test(arg)) {
      return arg.replace(/%filepath/g, fpath)
    }
    if (/%filename/.test(arg)) {
      return arg.replace(/%filename/g, path.basename(fpath))
    }
    if (/%file/.test(arg)) {
      usePipe = false
      return arg.replace(/%file/g, fpath)
    }
    if (/%tempfile/.test(arg)) {
      usePipe = false
      tempFilename = await tempy.write(input, { extension: path.extname(fpath) })
      return arg.replace(/%tempfile/g, tempFilename);
    }

    return arg
  }))

  logger.log(`linter run args: ${JSON.stringify(args)}`)

  const result = await spawnAsync(
    command,
    args,
    {
      ...option,
      shell: os.platform() === 'win32' ? true : undefined,
      input: usePipe ? input : undefined
    }
  );

  if (tempFilename != null) {
    await del(tempFilename, { force: true });
  }

  return result;
}

export interface SpawnAsyncOptions extends SpawnOptions {
  input?: Readable
}

export async function spawnAsync(
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnAsyncOptions
): Promise<{
  code: number,
  stdout: string,
  stderr: string
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      args,
      { ...options, shell: os.platform() === 'win32' ? true : undefined }
    );
    let stdout = ''
    let stderr = ''
    let error: Error

    child.stdout.on('data', (data) => {
      stdout += data
    });

    child.stderr.on('data', (data) => {
      stderr += data
    });

    child.on('error', (err: Error) => {
      error = err
      reject(error)
    });

    child.on('close', (code) => {
      if (!error) {
        resolve({ code, stdout, stderr })
      }
    });

    // error will occur when cp get error
    if (options.input) {
      options.input.pipe(child.stdin).on('error', () => {})
    }
  });
}

// find work dirname by root patterns
export async function findWorkDirectory(
  filePath: string,
  rootPatterns: string | string[]
): Promise<string> {
  const dirname = path.dirname(filePath)
  let patterns = [].concat(rootPatterns)
  try {
    for(const pattern of patterns){
      const dir = await findUp(async directory => {
        const hasMatch = await findUp.exists(path.join(directory, pattern))
        logger.log(`searching working directory: ${directory}, cwd: ${dirname}, pattern: ${pattern}, matches: ${hasMatch}`)
        return hasMatch && directory
      }, {type: 'directory', cwd: dirname})


      if (dir && dir !== "/") {
        return dir
      }
    }
  } catch (err) {
    // do nothing on error
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
    if (fs.existsSync(path.join(workDir, testPath))) {
      return true
    }
  }

  return false
}
