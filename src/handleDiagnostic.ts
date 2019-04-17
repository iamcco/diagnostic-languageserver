import {
  TextDocument,
  DiagnosticSeverity,
  Diagnostic,
  IConnection,
} from 'vscode-languageserver';
import VscUri from 'vscode-uri';
import findup from 'findup';
import path from 'path';
import fs from 'fs';
import { Subscription, Subject, from, timer } from 'rxjs';
import { filter, switchMap, map } from 'rxjs/operators';

import { waitMap } from './observable';
import { ILinterConfig, SecurityKey } from './types';
import { executeFile, pcb } from './util';
import HunkStream from './hunkStream';
import logger from './logger';

const securityMap = {
  'error': DiagnosticSeverity.Error,
  'warning': DiagnosticSeverity.Warning,
  'info': DiagnosticSeverity.Information,
  'hint': DiagnosticSeverity.Hint
}

function sumNum(num: string | undefined, ...args: number[]) {
  if (num === undefined) {
    return 0
  }
  return args.reduce((res, next) => res + next, parseInt(num, 10))
}

function formatMessage(
  message: number | Array<number|string>,
  match: RegExpMatchArray
) {
  return [].concat(message).reduce((res, next) => {
    if (typeof next === 'number') {
      res += match[next]
    } else {
      res += next
    }
    return res
  }, '')
}

function getSecurity(
  securityKey: SecurityKey
) {
  const security = securityMap[securityKey]
  return security !== undefined ? security : 1
}

// find work dirname by root patterns
async function findWorkDirectory(
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

async function findCommand(command: string, workDir: string) {
  if (/^(\.\.|\.)/.test(command)) {
    let cmd = path.join(workDir, command)
    if (fs.existsSync(cmd)) {
      return command
    }
    return path.basename(cmd)
  }
  return command
}

export async function handleDiagnostics(
  textDocument: TextDocument,
  configs: ILinterConfig[]
) {
  let diagnostics: Diagnostic[] = []
  for (const linter of configs) {
    const dias = await handleLinter(textDocument, linter)
    diagnostics = diagnostics.concat(dias)
  }
  return {
    uri: textDocument.uri,
    diagnostics
  }
}

export async function handleLinter (
  textDocument: TextDocument,
  config: ILinterConfig
): Promise<Diagnostic[]> {
  const text = textDocument.getText();
  const {
    command,
    rootPatterns = [],
    args = [],
    sourceName,
    formatLines = 1,
    formatPattern,
    offsetLine = 0,
    offsetColumn = 0,
    isStdout,
    isStderr,
    securities = {}
  } = config
  let diagnostics: Diagnostic[] = [];
  // verify params
  if (!command || !sourceName || !formatLines || !formatPattern) {
    logger.error(`[${textDocument.languageId}] missing config`)
    return diagnostics
  }
  try {
    const workDir = await findWorkDirectory(
      VscUri.parse(textDocument.uri).path,
      rootPatterns
    )
    const cmd = await findCommand(command, workDir)
    const {
      stdout = '',
      stderr = ''
    } = await executeFile(
      new HunkStream(text),
      cmd,
      args,
      {
        cwd: workDir
      }
    )
    let lines = []
    if (isStdout == undefined && isStderr === undefined) {
      lines = stdout.split('\n')
    } else {
      if (isStdout) {
        lines = lines.concat(stdout.split('\n'))
      }
      if (isStderr) {
        lines = lines.concat(stderr.split('\n'))
      }
    }
    let str: string = lines.shift()
    while(lines.length > 0 || str !== undefined) {
      str = [str].concat(lines.slice(0, formatLines - 1)).join('\n')
      const m = str.match(new RegExp(formatPattern[0]))
      if (m) {
        const { line, column, message, security } = formatPattern[1]
        let diagnostic: Diagnostic = {
          severity: getSecurity(securities[m[security]]),
          range: {
            start: {
              // line and character is base zero so need -1
              line: sumNum(m[line], -1, offsetLine),
              character: sumNum(m[column], -1, offsetColumn)
            },
            end: {
              line: sumNum(m[line], -1, offsetLine),
              character: sumNum(m[column], offsetColumn)
            }
          },
          message: formatMessage(message, m),
          source: sourceName
        };
        diagnostics.push(diagnostic);
      }
      str = lines.shift()
    }
  } catch (error) {
    logger.error(`[${textDocument.languageId}] diagnostic handle fail: ${error.message}`)
  }
  return diagnostics
}

const origin$: Subject<TextDocument> = new Subject<TextDocument>()

const subscriptions: {
  [uri: string]: Subscription
} = {}

export function next(
  textDocument: TextDocument,
  connection: IConnection,
  configs: ILinterConfig[]
) {
  const { uri } = textDocument
  if (!subscriptions[uri]) {
    const debounce = Math.max(...configs.map(i => i.debounce), 100)
    subscriptions[uri] = origin$.pipe(
      filter(textDocument => textDocument.uri === uri),
      switchMap((textDocument: TextDocument) => {
        return timer(debounce).pipe(
          map(() => textDocument)
        )
      }),
      waitMap((textDocument: TextDocument) => {
        return from(handleDiagnostics(textDocument, configs))
      }),
    ).subscribe(
      (diagnostics) => {
        connection.sendDiagnostics(diagnostics);
      },
      (error: Error) => {
        logger.error(`[${textDocument.languageId}]: observable error: ${error.message}`)
      }
    )
  }
  origin$.next(textDocument)
}

export function unsubscribe(textDocument: TextDocument) {
  const { uri } = textDocument
  const subp = subscriptions[uri]
  if (subp && !subp.closed) {
    subp.unsubscribe()
  }
  subscriptions[uri] = undefined
}
