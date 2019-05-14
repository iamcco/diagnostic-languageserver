export type SecurityKey = 'error' | 'warning' | 'info' | 'hint'
export interface ISecurities {
  [key: string]: SecurityKey
}

// config of per language
export interface ILinterConfig {
  command: string
  rootPatterns: string[] | string
  isStdout?: boolean
  isStderr?: boolean
  debounce?: number
  args?: Array<string|number>
  sourceName: string
  formatLines?: number
  formatPattern: [string, {
    line: number,
    column: number,
    message: Array<number|string> | number,
    security: number
    file: string
  }]
  securities?: ISecurities
  offsetLine?: number
  offsetColumn?: number
}

// config of per formatter
export interface IFormatterConfig {
  command: string
  args?: Array<string|number>
  rootPatterns?: string[] | string
  isStdout?: boolean
  isStderr?: boolean
}

// initializationOptions config
export interface IConfig {
  linters: {
    [linter: string]: ILinterConfig
  }
  filetypes: {
    [fileType: string]: string | string[]
  }
  formatters: {
    [formatter: string]: IFormatterConfig
  }
  formatFiletypes: {
    [fileType: string]: string | string[]
  }
}
