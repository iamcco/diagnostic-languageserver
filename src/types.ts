// config of per language
export interface IConfigItem {
  command: string
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
  [fileType: string]: IConfigItem
}
