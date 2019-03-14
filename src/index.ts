import {
  createConnection,
  TextDocuments,
  InitializeParams,
  IConnection,
} from 'vscode-languageserver';

import { IConfig } from './types';
import { handleDiagnostic } from './handle';

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
documents.onDidChangeContent(async ( change ) => {
  const textDocument = change.document
  const configItem = config[textDocument.languageId]
  if (configItem) {
    try {
      const diagnostics =  await handleDiagnostic(textDocument, configItem)
      if (diagnostics) {
        connection.sendDiagnostics(diagnostics);
      }
    } catch (error) {
      connection.console.log(`Handle Diagnostic Error: ${error.message}`)
    }
  }
});

// listen for document's open/close/change
documents.listen(connection);

// lsp start
connection.listen();
