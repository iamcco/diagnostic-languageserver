import {
  TextDocument,
  DiagnosticSeverity,
  Diagnostic,
} from 'vscode-languageserver';

import { ILinterConfig, SecurityKey } from './types';
import { executeFile } from './util';
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
  logger.log(securityKey)
  const security = securityMap[securityKey]
  return security !== undefined ? security : 1
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
    const {
      stdout = '',
      stderr = ''
    } = await executeFile(new HunkStream(text), command, args)
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
