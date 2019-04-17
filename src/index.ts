import {
  createConnection,
  TextDocuments,
  InitializeParams,
  IConnection,
  DocumentFormattingParams,
  CancellationToken,
} from 'vscode-languageserver';

import { IConfig } from './common/types';
import {
  next as diagnosticNext,
  unsubscribe as diagnosticUnsubscribe
} from './handles/handleDiagnostic'
import logger from './common/logger';
import { formatDocument } from './handles/handleFormat';

// create connection by command argv
const connection: IConnection = createConnection();

// init logger
logger.init(connection)

// sync text document manager
const documents: TextDocuments = new TextDocuments();

// config of initializationOptions
let config: IConfig

// lsp initialize
connection.onInitialize((param: InitializeParams) => {
  const { initializationOptions = {} } = param

  config = initializationOptions

  return {
    capabilities: {
      textDocumentSync: documents.syncKind,
      documentFormattingProvider: true
    }
  };
});

// document change or open
documents.onDidChangeContent(( change ) => {
  const textDocument = change.document
  const { linters = {}, filetypes = {} } = config
  if (!filetypes[textDocument.languageId]) {
    return
  }
  const linter = [].concat(filetypes[textDocument.languageId])
  const configItems = linter.map(l => linters[l]).filter(l => l)
  if (configItems.length === 0) {
    return
  }
  diagnosticNext(textDocument, connection, configItems)
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
  if (!formatFiletypes[doc.languageId]) {
    return
  }
  const formatterNames = [].concat(formatFiletypes[doc.languageId])
  const formatterConfigs = formatterNames.map(n => formatters[n]).filter(n => n)
  if (formatterConfigs.length === 0) {
    return
  }
  return await formatDocument(formatterConfigs, doc, token)
})

// lsp start
connection.listen();
