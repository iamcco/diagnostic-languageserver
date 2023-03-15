import { Command } from 'commander';
import {
  createConnection,
  TextDocuments,
  InitializeParams,
  IConnection,
  DocumentFormattingParams,
  CancellationToken,
  MessageType,
  TextDocumentChangeEvent,
  TextDocumentSyncKind,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument'

import { IConfig } from './common/types';
import {
  next as diagnosticNext,
  unsubscribe as diagnosticUnsubscribe
} from './handles/handleDiagnostic'
import logger from './common/logger';
import { formatDocument } from './handles/handleFormat';

// parse command line options
const options = new Command("diagnostic-languageserver")
  .version(require("../package.json").version)
  .option("--log-level <logLevel>", "A number indicating the log level (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `2`.")
  .option("--stdio", "use stdio")
  .option("--node-ipc", "use node-ipc")
  .option("--socket <port>", "use socket. example: --socket=5000")
  .allowUnknownOption(true)
  .parse(process.argv);
let logLevel: MessageType = MessageType.Warning
if (options.logLevel) {
  logLevel = parseInt(options.logLevel, 10) as any;
  if (logLevel && (logLevel < 1 || logLevel > 4)) {
    logger.error("Invalid `--log-level " + logLevel + "`. Falling back to `log` level.")
    logLevel = MessageType.Log
  }
}

// create connection by command argv
const connection: IConnection = createConnection();

// init logger
logger.init(connection, logLevel)

// sync text document manager
const documents = new TextDocuments(TextDocument)

// config of initializationOptions
let config: IConfig

// lsp initialize
connection.onInitialize((param: InitializeParams) => {
  const { initializationOptions = {} } = param

  config = initializationOptions

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentFormattingProvider: true
    }
  };
});

const handleDiagnostic = ( change: TextDocumentChangeEvent<TextDocument>, onSave: boolean ) => {
  const textDocument = change.document
  const { linters = {}, filetypes = {} } = config
  if (!filetypes[textDocument.languageId] && !filetypes['*']) {
    return
  }
  const linter = [].concat(filetypes[textDocument.languageId]).concat(filetypes['*'])
  const configItems = linter.map(l => linters[l]).filter(l => (l && (onSave || !l.onSaveOnly)))
  if (configItems.length === 0) {
    return
  }
  diagnosticNext(textDocument, connection, configItems)
}

// document change or open
documents.onDidChangeContent((evt) => {
    handleDiagnostic(evt, false)
});

// document will save
documents.onDidSave((evt) => {
    handleDiagnostic(evt, true)
});

documents.onDidClose((evt) => {
  diagnosticUnsubscribe(evt.document)
})

// listen for document's open/close/change
documents.listen(connection);

// handle format request
connection.onDocumentFormatting(async (
  params: DocumentFormattingParams,
  token: CancellationToken
) => {
  const { textDocument } = params
  if (!textDocument || !textDocument.uri) {
    return
  }
  const doc = documents.get(textDocument.uri)
  if (!doc) {
    return
  }
  const { formatters, formatFiletypes } = config
  if (!formatFiletypes[doc.languageId] && !formatFiletypes['*']) {
    return
  }
  const formatterNames = [].concat(formatFiletypes[doc.languageId]).concat(formatFiletypes['*'])
  const formatterConfigs = formatterNames.map(n => formatters[n]).filter(n => n)
  if (formatterConfigs.length === 0) {
    return
  }
  return formatDocument(formatterConfigs, doc, token)
})

// lsp start
connection.listen();
