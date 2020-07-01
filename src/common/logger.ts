import { IConnection, MessageType } from 'vscode-languageserver';

let connection: IConnection
let level: MessageType

export default {
  init: (con: IConnection, lev: MessageType) => {
    connection = con
    level = lev
  },
  error: (message: string) => {
    if (connection && level >= MessageType.Error) {
      connection.console.error(message)
    }
  },
  warn: (message: string) => {
    if (connection && level >= MessageType.Warning) {
      connection.console.warn(message)
    }
  },
  info: (message: string) => {
    if (connection && level >= MessageType.Info) {
      connection.console.info(message)
    }
  },
  log: (message: string) => {
    if (connection && level >= MessageType.Log) {
      connection.console.log(message)
    }
  },
}
