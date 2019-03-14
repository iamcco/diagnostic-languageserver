import { TextDocument, IConnection } from 'vscode-languageserver';
import { Subscription, Subject, from, timer } from 'rxjs';
import { filter, switchMap, map } from 'rxjs/operators';

import { waitMap } from './observable';
import { handleDiagnostic } from './handle';
import { ILinterConfig } from './types';

const origin$: Subject<TextDocument> = new Subject<TextDocument>()

const subscriptions: {
  [uri: string]: Subscription
} = {}

export function next(
  textDocument: TextDocument,
  connection: IConnection,
  config: ILinterConfig
) {
  const { uri } = textDocument
  if (!subscriptions[uri]) {
    const { debounce = 100 } = config
    subscriptions[uri] = origin$.pipe(
      filter(textDocument => textDocument.uri === uri),
      switchMap((textDocument: TextDocument) => {
        return timer(debounce).pipe(
          map(() => textDocument)
        )
      }),
      waitMap((textDocument: TextDocument) => {
        return from(handleDiagnostic(textDocument, config))
      }),
    ).subscribe(
      (diagnostics) => {
        connection.sendDiagnostics(diagnostics);
      },
      (error: Error) => {
        connection.console.log(`[${textDocument.languageId}]: observable error: ${error.message}`)
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
