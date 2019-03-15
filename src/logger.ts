import { IConnection } from 'vscode-languageserver';

let connection: IConnection

export default {
  init: (con: IConnection) => {
    connection = con
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
