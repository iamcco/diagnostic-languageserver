import { IConnection, MessageType } from 'vscode-languageserver';

class Logger {
  isInit = false
  connection: IConnection
  level: MessageType
  logs: Array<{type: string, message: string}> = []

  init (con: IConnection, lev: MessageType) {
    this.connection = con
    this.level = lev
    this.isInit = true
    if (this.logs.length) {
      this.logs.forEach(log => {
        if (this[log.type]) {
          this[log.type](log.message)
        }
      })
      this.logs = []
    }
  }
  error (message: string) {
    if (!this.isInit) {
      return this.logs.push({
        type: 'error',
        message
      })
    }
    if (this.connection && this.level >= MessageType.Error) {
      this.connection.console.error(message)
    }
  }
  warn (message: string) {
    if (!this.isInit) {
      return this.logs.push({
        type: 'warn',
        message
      })
    }
    if (this.connection && this.level >= MessageType.Warning) {
      this.connection.console.warn(message)
    }
  }
  info (message: string) {
    if (!this.isInit) {
      return this.logs.push({
        type: 'info',
        message
      })
    }
    if (this.connection && this.level >= MessageType.Info) {
      this.connection.console.info(message)
    }
  }
  log (message: string) {
    if (!this.isInit) {
      return this.logs.push({
        type: 'log',
        message
      })
    }
    if (this.connection && this.level >= MessageType.Log) {
      this.connection.console.log(message)
    }
  }
}

export default new Logger()
