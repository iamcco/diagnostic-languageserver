// config of per language
export interface ILinterConfig {
  command: string
  debounce?: number
  args?: Array<string|number>
  sourceName: string
  formatLines?: number
  formatPattern: [string, {
    line: number,
    column: number,
    message: Array<number|string> | number
  }]
  offsetLine?: number
  offsetColumn?: number
}

// initializationOptions config
export interface IConfig {
  linters: {
    [linter: string]: ILinterConfig
  }
  filetypes: {
    [fileType: string]: string
  }
}
