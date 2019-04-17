import {
  createConnection,
  TextDocuments,
  InitializeParams,
  IConnection,
  DocumentFormattingParams,
  CancellationToken,
} from 'vscode-languageserver';

import { IConfig } from './types';
import { next, unsubscribe } from './stream';
import logger from './logger';

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
  const linter = [].concat(filetypes[textDocument.languageId])
  if (linter.length === 0) {
    return
  }
  const configItems = linter.map(l => linters[l]).filter(l => l)
  if (configItems.length === 0) {
    return
  }
  next(textDocument, connection, configItems)
});

documents.onDidClose((evt) => {
  unsubscribe(evt.document)
})

// listen for document's open/close/change
documents.listen(connection);

connection.onDocumentFormatting((
  params: DocumentFormattingParams,
  token: CancellationToken
) => {
  return []
})

// lsp start
connection.listen();
