import {
  createConnection,
  TextDocuments,
  InitializeParams,
  IConnection,
} from 'vscode-languageserver';

import { IConfig } from './types';
import { next, unsubscribe } from './stream';

// create connection by command argv
const connection: IConnection = createConnection();

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
    }
  };
});

// document change or open
documents.onDidChangeContent(( change ) => {
  const textDocument = change.document
  const { linters = {}, filetypes = {} } = config
  const linter = filetypes[textDocument.languageId]
  if (!linter) {
    return
  }
  const configItem = linters[linter]
  if (!configItem) {
    return
  }
  next(textDocument, connection, configItem)
});

documents.onDidClose((evt) => {
  unsubscribe(evt.document)
})

// listen for document's open/close/change
documents.listen(connection);

// lsp start
connection.listen();
