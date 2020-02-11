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
import { ILinterConfig, SecurityKey, ILinterResult } from '../common/types';
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

function sumNum(num: string | number | undefined, ...args: number[]) {
  if (num === undefined) {
    return 0
  }
  return args.reduce((res, next) => res + next, Number(num))
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

function handleLinterRegex(output: string, config: ILinterConfig): ILinterResult[] {
  const {
    formatLines = 1,
    formatPattern,
  } = config
  let linterResults: ILinterResult[] = [];

  if (!formatLines || !formatPattern) {
    throw new Error('missing formatLines or formatPattern')
  }

  const { line, column, endLine, endColumn, message, security } = formatPattern[1]
  const lines = output.split('\n')

  let str: string = lines.shift()
  while(lines.length > 0 || str !== undefined) {
    str = [str].concat(lines.slice(0, formatLines - 1)).join('\n')
    const m = str.match(new RegExp(formatPattern[0]))
    logger.log(`match string: ${str}`)
    logger.log(`match result: ${JSON.stringify(m, null, 2)}`)
    if (m) {
      linterResults.push({
        security: m[security],
        line: m[line],
        column: m[column],
        endLine: endLine != null ? m[endLine] : undefined,
        endColumn: endColumn != null ? m[endColumn] : undefined,
        message: formatMessage(message, m),
      });
    }
    str = lines.shift()
  }

  return linterResults
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

function handleLinterJson(output: string, config: ILinterConfig): ILinterResult[] {
  if (!config.parseJson) {
    throw new Error('missing parseJson')
  }

  const {
    errorsRoot,
    line,
    column,
    endLine,
    endColumn,
    security,
    message,
  } = config.parseJson

  const resultsFromJson: any[] = errorsRoot
    ? lodashGet(JSON.parse(output), errorsRoot, [])
    : JSON.parse(output)

  return resultsFromJson.map<ILinterResult>(jsonObject => {
    return {
      security: lodashGet(jsonObject, security, ''),
      line: lodashGet(jsonObject, line, -1),
      column: lodashGet(jsonObject, column, -1),
      endLine: endLine ? lodashGet(jsonObject, endLine, -1) : undefined,
      endColumn: endColumn ? lodashGet(jsonObject, endColumn, -1) : undefined,
      message: formatStringWithObject(message, jsonObject),
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
    offsetLine = 0,
    offsetColumn = 0,
    sourceName,
    isStdout,
    isStderr,
    securities = {}
  } = config
  const diagnostics: Diagnostic[] = [];
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

    logger.log(`Linter command: ${cmd}, args: ${JSON.stringify(args)}`)
    logger.log(`stdout: ${stdout}`)
    logger.log(`stderr: ${stderr}`)

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

    const linterResults: ILinterResult[] = config.parseJson
      ? handleLinterJson(output, config)
      : handleLinterRegex(output, config)

    return linterResults.map<Diagnostic>((linterResult) => {
      const endLine = linterResult.endLine != null
        ? linterResult.endLine
        : linterResult.line
      const endColumn = linterResult.endColumn != null
        ? linterResult.endColumn
        : linterResult.column

      return {
        severity: getSecurity(securities[linterResult.security]),
        range: {
          start: {
            // line and character is base zero so need -1
            line: sumNum(linterResult.line, -1, offsetLine),
            character: sumNum(linterResult.column, -1, offsetColumn)
          },
          end: {
            line: sumNum(endLine, -1, offsetLine),
            character: sumNum(endColumn, -1, offsetColumn)
          }
        },
        message: linterResult.message,
        source: sourceName
      }
    })
  } catch (error) {
    logger.error(`[${textDocument.languageId}] diagnostic handle fail: [${sourceName}] ${error.message}`)
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
