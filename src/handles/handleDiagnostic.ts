import {
  TextDocument,
  DiagnosticSeverity,
  Diagnostic,
  IConnection,
} from 'vscode-languageserver';
import VscUri from 'vscode-uri';
import { Subscription, Subject, from, timer } from 'rxjs';
import { filter, switchMap, map } from 'rxjs/operators';

import { waitMap } from '../common/observable';
import { ILinterConfig, SecurityKey } from '../common/types';
import { executeFile, findWorkDirectory, findCommand, checkAnyFileExists } from '../common/util';
import HunkStream from '../common/hunkStream';
import logger from '../common/logger';
import lodashGet from 'lodash/get';

const securityMap = {
  'error': DiagnosticSeverity.Error,
  'warning': DiagnosticSeverity.Warning,
  'info': DiagnosticSeverity.Information,
  'hint': DiagnosticSeverity.Hint
}

const origin$: Subject<TextDocument> = new Subject<TextDocument>()

const subscriptions: {
  [uri: string]: Subscription
} = {}

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

function handleLinterRegex(output: string, config: ILinterConfig): Diagnostic[] {
  const {
    formatLines = 1,
    formatPattern,
    offsetLine = 0,
    offsetColumn = 0,
    securities = {},
    sourceName
  } = config
  let diagnostics: Diagnostic[] = [];

  if (!formatLines || !formatPattern) {
    throw new Error('missing formatLines or formatPattern')
  }

  const { line, column, endLine, endColumn, message, security } = formatPattern[1]
  const endLineLookup = endLine != null ? endLine : line
  const endColumnLookup = endColumn != null ? endColumn : column
  const lines = output.split('\n')

  let str: string = lines.shift()
  while(lines.length > 0 || str !== undefined) {
    str = [str].concat(lines.slice(0, formatLines - 1)).join('\n')
    const m = str.match(new RegExp(formatPattern[0]))
    if (m) {
      let diagnostic: Diagnostic = {
        severity: getSecurity(securities[m[security]]),
        range: {
          start: {
            // line and character is base zero so need -1
            line: sumNum(m[line], -1, offsetLine),
            character: sumNum(m[column], -1, offsetColumn)
          },
          end: {
            line: sumNum(m[endLineLookup], -1, offsetLine),
            character: sumNum(m[endColumnLookup], -1, offsetColumn)
          }
        },
        message: formatMessage(message, m),
        source: sourceName
      };
      diagnostics.push(diagnostic);
    }
    str = lines.shift()
  }

  return diagnostics
}

const variableFinder = /\$\{[^}]+}/g;

function formatStringWithObject<T extends Record<string, any> | any[]>(
  str: string,
  obj: T
) {
  return str.replace(variableFinder, k => {
    // Remove `${` and `}`
    const lookup = k.slice(2, -1).trim();

    return lodashGet(obj, lookup, '');
  });
}

function handleLinterJson(output: string, config: ILinterConfig): Diagnostic[] {
  logger.error(output)
  if (!config.parseJson) {
    throw new Error('missing parseJson')
  }

  const {
    offsetLine = 0,
    offsetColumn = 0,
    securities = {},
    sourceName
  } = config
  const {
    errorsRoot,
    line,
    column,
    endLine,
    endColumn,
    security,
    message,
  } = config.parseJson

  const endLineLookup = endLine || line;
  const endColumnLookup = endColumn || column;

  const diagnosticsFromJson: any[] = errorsRoot
    ? lodashGet(JSON.parse(output), errorsRoot, [])
    : JSON.parse(output)

  return diagnosticsFromJson.map<Diagnostic>(x => {
    return {
      severity: getSecurity(securities[lodashGet(x, security, '')]),
      range: {
        start: {
          // line and character is base zero so need -1
          line: sumNum(lodashGet(x, line, -1), -1, offsetLine),
          character: sumNum(lodashGet(x, column, -1), -1, offsetColumn)
        },
        end: {
          line: sumNum(lodashGet(x, endLineLookup, -1), -1, offsetLine),
          character: sumNum(lodashGet(x, endColumnLookup, -1), -1, offsetColumn)
        }
      },
      message: formatStringWithObject(message, x),
      source: sourceName
    }
  });
}

async function handleLinter (
  textDocument: TextDocument,
  config: ILinterConfig
): Promise<Diagnostic[]> {
  const {
    command,
    rootPatterns = [],
    args = [],
    sourceName,
    isStdout,
    isStderr,
  } = config
  let diagnostics: Diagnostic[] = [];
  // verify params
  if (!command || !sourceName) {
    logger.error(`[${textDocument.languageId}] missing config`)
    return diagnostics
  }
  try {
    const workDir = await findWorkDirectory(
      VscUri.parse(textDocument.uri).fsPath,
      rootPatterns,
    )

    if (config.requiredFiles && config.requiredFiles.length) {
      if (!checkAnyFileExists(workDir, config.requiredFiles)) {
        return diagnostics
      }
    }

    const cmd = await findCommand(command, workDir)
    let output = ''
    const {
      stdout = '',
      stderr = ''
    } = await executeFile(
      new HunkStream(textDocument.getText()),
      textDocument,
      cmd,
      args,
      {
        cwd: workDir
      }
    )

    if (isStdout == undefined && isStderr === undefined) {
      output = stdout
    } else {
      if (isStdout) {
        output += stdout
      }
      if (isStderr) {
        output += stderr
      }
    }
  } catch (error) {
    logger.error(`[${textDocument.languageId}] diagnostic handle fail: ${error.message}`)
  }
  return diagnostics
}

async function handleDiagnostics(
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
