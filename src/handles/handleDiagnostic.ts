import {
  TextDocument,
  DiagnosticSeverity,
  Diagnostic,
  IConnection,
} from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { Subscription, Subject, from, timer } from 'rxjs';
import { filter, switchMap, map } from 'rxjs/operators';
import { isAbsolute, join, relative } from 'path';
import ig from 'ignore';

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

function handleLinterRegex(currentSourceName: string, output: string, config: ILinterConfig): ILinterResult[] {
  const {
    formatLines = 1,
    formatPattern,
  } = config
  let linterResults: ILinterResult[] = [];

  if (!formatLines || !formatPattern) {
    throw new Error('missing formatLines or formatPattern')
  }

  const { sourceName, line, column, endLine, endColumn, message, security } = formatPattern[1]
  const lines = output.split('\n')

  let str: string = lines.shift()
  while(lines.length > 0 || str !== undefined) {
    str = [str].concat(lines.slice(0, formatLines - 1)).join('\n')
    const m = str.match(new RegExp(formatPattern[0]))
    logger.log(`match string: ${str}`)
    logger.log(`match result: ${JSON.stringify(m, null, 2)}`)
    if (m) {
      linterResults.push({
        sourceName: sourceName ? m[sourceName] : currentSourceName,
        security: m[security],
        line: m[line],
        column: m[column],
        endLine: endLine != undefined ? m[endLine] : undefined,
        endColumn: endColumn != undefined ? m[endColumn] : undefined,
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

function handleLinterJson(currentSourceName: string, output: string, config: ILinterConfig, fpath: string): ILinterResult[] {
  if (!config.parseJson) {
    throw new Error('missing parseJson')
  }

  const {
    sourceName,
    line,
    column,
    endLine,
    endColumn,
    security,
    message,
  } = config.parseJson

  const errorsRoot = (typeof config.parseJson.errorsRoot === 'string')
    ? config.parseJson.errorsRoot.replace('%filepath', fpath)
    : config.parseJson.errorsRoot.map(v => v.replace('%filepath', fpath));

  const resultsFromJson: any[] = errorsRoot
  ? lodashGet(JSON.parse(output), errorsRoot, [])
    : JSON.parse(output)

  return resultsFromJson.filter(jsonObject => {
    return null !== lodashGet(jsonObject, line)
  }).map<ILinterResult>(jsonObject => {
    return {
      sourceName: sourceName ? lodashGet(jsonObject, sourceName) : currentSourceName,
      security: lodashGet(jsonObject, security),
      line: lodashGet(jsonObject, line),
      column: lodashGet(jsonObject, column),
      endLine: endLine ? lodashGet(jsonObject, endLine) : undefined,
      endColumn: endColumn ? lodashGet(jsonObject, endColumn) : undefined,
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
    offsetLineStart = 0,
    offsetLineEnd = 0,
    offsetColumnStart = 0,
    offsetColumnEnd = 0,
    sourceName,
    isStdout,
    isStderr,
    ignore,
    securities = {}
  } = config
  const diagnostics: Diagnostic[] = [];
  // verify params
  if (!command || !sourceName) {
    logger.error(`[${textDocument.languageId}] missing config`)
    return diagnostics
  }

  // Validate when sourceNameFilter is given that sourceName is also given.
  if (config.formatPattern && (!config.formatPattern[1].sourceName && config.formatPattern[1].sourceNameFilter)) {
    logger.error(
      `[${textDocument.languageId}] formatPattern.sourceNameFilter can only be used when formatPattern.sourceName is defined`)
    return diagnostics
  } else if (config.parseJson && (!config.parseJson.sourceName && config.parseJson.sourceNameFilter)) {
    logger.error(
      `[${textDocument.languageId}] parseJson.sourceNameFilter can only be used when parseJson.sourceName is defined`)
    return diagnostics
  }

  try {
    const currentFile = URI.parse(textDocument.uri).fsPath
    const workDir = await findWorkDirectory(currentFile, rootPatterns)

    // ignore file
    const relPath = relative(workDir, currentFile)
    try {
      if (!isAbsolute(relPath) && ignore && ig().add(ignore).ignores(relPath)) {
        return diagnostics
      }
    } catch (err) {
      logger.error(`ignore error: ${err.message || err.name || err}`)
    }

    logger.info(`found working directory ${workDir}`)

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

    let linterResults: ILinterResult[] = config.parseJson
    ? handleLinterJson(sourceName, output, config, URI.parse(textDocument.uri).fsPath)
      : handleLinterRegex(sourceName, output, config)

    // Check if we should filter based on the sourceName.
    if ((config.parseJson && config.parseJson.sourceNameFilter)
      || config.formatPattern && config.formatPattern[1].sourceNameFilter) {
      const lengthBefore = linterResults.length;
      // Only use results that belong to the current file.
      linterResults = linterResults.filter(x => {
        // Check if the linter returned an absolute or relative path.
        return isAbsolute(x.sourceName)
          ? currentFile === x.sourceName
          : currentFile === join(workDir, x.sourceName)
      })
      logger.log(`Linting results after filtering: ${linterResults.length} (before: ${lengthBefore})`)
    }

    return linterResults.map<Diagnostic>((linterResult) => {
      let { line, column, endLine, endColumn } = linterResult
      if (line !== undefined && column === undefined &&
        endLine === undefined && endColumn === undefined) {
        column = 1
        endLine = Number(line) + 1
        endColumn = 1
      } else {
        endLine = linterResult.endLine != undefined
          ? linterResult.endLine
          : linterResult.line
        endColumn = linterResult.endColumn != undefined
          ? linterResult.endColumn
          : linterResult.column
      }

      return {
        severity: getSecurity(securities[linterResult.security]),
        range: {
          start: {
            // line and character is base zero so need -1
            line: sumNum(line, -1, offsetLine + offsetLineStart),
            character: sumNum(column, -1, offsetColumn + offsetColumnStart)
          },
          end: {
            line: sumNum(endLine, -1, offsetLine + offsetLineEnd),
            character: sumNum(endColumn, -1, offsetColumn + offsetColumnEnd)
          }
        },
        message: linterResult.message,
        source: linterResult.sourceName,
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
