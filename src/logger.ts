import { IConnection } from 'vscode-languageserver';

let connection: IConnection

export default {
  init: (connection: IConnection) => {
    connection = connection
  },
  log: (message: string) => {
    if (connection) {
      connection.console.log(message)
    }
  },
  error: (message: string) => {
    if (connection) {
      connection.console.error(message)
    }
  },
  warn: (message: string) => {
    if (connection) {
      connection.console.warn(message)
    }
  },
  info: (message: string) => {
    if (connection) {
      connection.console.info(message)
    }
  },
}
