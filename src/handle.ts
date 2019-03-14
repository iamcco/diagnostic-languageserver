import { TextDocument, PublishDiagnosticsParams, DiagnosticSeverity, Diagnostic } from 'vscode-languageserver';

import { ILinterConfig } from './types';
import { executeFile } from './util';
import HunkStream from './hunkStream';

export async function handleDiagnostic (
  textDocument: TextDocument,
  config: ILinterConfig
): Promise<PublishDiagnosticsParams> {
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
  // verify params
  if (!command || !sourceName || !formatLines || !formatPattern) {
    throw new Error(`[${textDocument.languageId}] missing config`)
  }
  let diagnostics: Diagnostic[] = [];
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
    throw new Error(`[${textDocument.languageId}] diagnostic handle fail: ${error.message}`)
  }
  return {
    uri: textDocument.uri,
    version: textDocument.version,
    diagnostics
  }
}
