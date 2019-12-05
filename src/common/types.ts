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
    endLine?: number,
    endColumn?: number,
    message: Array<number|string> | number,
    security: number
  }]
  securities?: ISecurities
  offsetLine?: number
  offsetColumn?: number
  requiredFiles?: string[]
  parseJson?: {
    // Dot separated path. If empty, simply use the root.
    errorsRoot?: string | string[]

    line: string
    column: string

    // If left out, just use line / column
    endLine?: string
    endColumn?: string

    // Will be parsed from the error object.
    message: string
    security: string
  },
}

// config of per formatter
export interface IFormatterConfig {
  command: string
  args?: Array<string|number>
  rootPatterns?: string[] | string
  isStdout?: boolean
  isStderr?: boolean
  doesWriteToFile?: boolean
  requiredFiles?: string[]
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
