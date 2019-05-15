import { TextEdit, TextDocument, CancellationToken, Range, Position } from 'vscode-languageserver';
import VscUri from 'vscode-uri';

import { IFormatterConfig } from '../common/types';
import { findWorkDirectory, findCommand, executeFile } from '../common/util';
import HunkStream from '../common/hunkStream';

type Handle = (text: string) => Promise<string>

async function handleFormat(
  config: IFormatterConfig,
  textDocument: TextDocument,
  text: string,
  next: Handle
): Promise<string | undefined> {
  const {
    command,
    rootPatterns = [],
    isStdout,
    isStderr,
    args = [],
  } = config
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
    textDocument,
    cmd,
    args,
    {
      cwd: workDir
    }
  )
  let output = '';
  if (isStdout === undefined && isStderr === undefined) {
    output = stdout
  } else {
    if (isStdout) {
      output += stdout
    }
    if (isStderr) {
      output += stderr
    }
  }
  return await next(output)
}


export async function formatDocument(
  formatterConfigs: IFormatterConfig[],
  textDocument: TextDocument,
  token: CancellationToken
): Promise<TextEdit[]> {

  const resolve = formatterConfigs
  .reverse()
  .reduce((res: Handle, config: IFormatterConfig) => {
    return async (text: string): Promise<string | undefined> => {
      if (token.isCancellationRequested) {
        return
      }
      return await handleFormat(config, textDocument, text, res)
    }
  }, async (text: string) => text)

  const text = await resolve(textDocument.getText())

  if (!text) {
    return
  }

  return [{
    range: Range.create(
      Position.create(0, 0),
      Position.create(textDocument.lineCount + 1, 0)
    ),
    newText: text
  }]
}
