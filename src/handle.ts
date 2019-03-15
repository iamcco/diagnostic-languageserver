import { TextDocument, PublishDiagnosticsParams, DiagnosticSeverity, Diagnostic } from 'vscode-languageserver';

import { ILinterConfig } from './types';
import { executeFile } from './util';
import HunkStream from './hunkStream';
import logger from './logger';

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
    version: textDocument.version,
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
    offsetColumn = 0
  } = config
  let diagnostics: Diagnostic[] = [];
  // verify params
  if (!command || !sourceName || !formatLines || !formatPattern) {
    logger.error(`[${textDocument.languageId}] missing config`)
    return diagnostics
  }
  try {
    const { stdout = '' } = await executeFile(new HunkStream(text), command, args)
    const lines = stdout.split('\n')
    let str = lines.shift()
    while(lines.length > 0) {
      str = [str].concat(lines.slice(0, formatLines - 1)).join('\n')
      const m = str.match(new RegExp(formatPattern[0]))
      if (m) {
        let diagnostic: Diagnostic = {
          severity: DiagnosticSeverity.Error,
          range: {
            start: {
              // line and character is base zero so need -1
              line: parseInt(m[formatPattern[1].line], 10) - 1 - offsetLine,
              character: parseInt(m[formatPattern[1].column], 10) - 1 - offsetColumn
            },
            end: {
              line: parseInt(m[formatPattern[1].line], 10) - 1 - offsetLine,
              character: parseInt(m[formatPattern[1].column], 10) - offsetColumn
            }
          },
          message: [].concat(formatPattern[1].message).reduce((res, next) => {
            if (typeof next === 'number') {
              res += m[next]
            } else {
              res += next
            }
            return res
          }, ''),
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
