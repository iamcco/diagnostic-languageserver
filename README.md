# diagnostic-languageserver

> General purpose Language Server that integrate with
> linter to support diagnostic features

![image](https://user-images.githubusercontent.com/5492542/54487533-15590b80-48d2-11e9-8cba-7e58c0edcf6f.png)

## Install

``` bash
yarn global add diagnostic-languageserver
```

## Config & Document

languageserver config:

``` jsonc
{
  "languageserver": {
    "dls": {
      "command": "diagnostic-languageserver",
      "args": ["--stdio"],
      "filetypes": [ "sh", "email" ], // filetypes that you want to enable this lsp
      "initializationOptions": {
        "linters": {
          ...
        },
        "filetypes": {
          ...
        },
        "formatters": {
          ...
        },
        "formatFiletypes": {
          ...
        }
      }
    }
  }
}
```

`linters` field:

```jsonc
{
  "linterName": {                                    // linter name, for example: vint
    "command": "shellcheck",                         // linter command
    "rootPatterns": [],                              // root patterns, default empty array
    "isStdout": true,                                // use stdout output, default true
    "isStderr": false,                               // use stderr output, default false
    "debounce": 100,                                 // debounce time
    "args": [ "--format=gcc", "-"],                  // args
    "offsetLine": 0,                                 // offsetline
    "offsetColumn": 0,                               // offsetColumn
    "sourceName": "shellcheck",                      // source name
    "formatLines": 1,                                // how much lines for formatPattern[0] to match
    "formatPattern": [
      "^[^:]+:(\\d+):(\\d+):\\s+([^:]+):\\s+(.*)$",  // line match pattern (javascript regex)
      {
        "line": 1,                                   // diagnostic line use match group 1
        "column": 2,                                 // diagnostic column use match group 2
        "message": [4],                              // message to display use match group 4
        "security": 3                                // security to use match group 3, ignore if linter do not support security
      }
    ],
    "securities": {                                  // security keys, ignore if linter do not support security
      "error": "error",                              // [key: string]?: "error" | "warning" | "info" | "hint"
      "warning": "warning",
      "note": "info"
    }
  }
}
```

`filetypes` field:

```jsonc
{
  "sh": "linterName",                          // filetype: linterName or linterName[]
}
```

`formatters` field:

```jsonc
  "dartfmt": {                                 // formatter name
    "command": "dartfmt",                      // format command
    "args": [ "--fix" ],                       // args
    "rootPatterns": [],                        // root patterns, default empty array
    "isStdout": true,                          // use stdout output, default true
    "isStderr": false,                         // use stderr output, default false
  }
```

`formatFiletypes` field:

```jsonc
{
  "dart": "dartfmt",                          // filetype: formatterName or formatterName[]
}
```

## How to config a new linter

[shellcheck](https://github.com/koalaman/shellcheck) for example:

file `test.sh`:

``` sh
#!/usr/bin/env bash

echo `ls -al`
```

then:

```bash
shellcheck --format=gcc test.sh
```

output:

```text
t.sh:3:6: warning: Quote this to prevent word splitting. [SC2046]
t.sh:3:6: note: Useless echo? Instead of 'echo $(cmd)', just use 'cmd'. [SC2005]
t.sh:3:6: note: Use $(...) notation instead of legacy backticked `...`. [SC2006]
```

write pattern to match the line for `line` `column` `message` `security`:

```javascript
const line = "t.sh:3:6: warning: Quote this to prevent word splitting. [SC2046]"
const formatPattern = "^[^:]+:(\\d+):(\\d+):\\s+([^:]+):\\s+(.*)$"
const match = line.match(new RegExp(formatPattern))
console.log(match)
```

output:

``` jsonc
{
  0: "t.sh:3:6: warning: Quote this to prevent word splitting. [SC2046]"
  1: "3"
  2: "6"
  3: "warning"
  4: "Quote this to prevent word splitting. [SC2046]"
}
```

so you got:

- `line`: `match[1]`
- `column`: `match[2]`
- `message`: `match[4]`
- `security`: `match[3]`

and your `formatPattern` field will be:

```jsonc
"formatPattern": [
  "^[^:]+:(\\d+):(\\d+):\\s+([^:]+):\\s+(.*)$",    // line match pattern (javascript regex)
  {
    "line": 1,                                     // diagnostic line use match group 1
    "column": 2,                                   // diagnostic column use match group 2
    "message": [4],                                // message to display use match group 4
    "security": 3                                  // security to use match group 3, ignore if linter do not support security
  }
]
```

> **Notes**
> if the linter's message for per issue more then one line, you have to set the `formatLines` to fill your pattern,
> and you can view the languagetool pattern for example which `formatLines = 2`

## Example with [coc.nvim](https://github.com/neoclide/coc.nvim)

1. [shellcheck](https://github.com/koalaman/shellcheck) for shell
2. [languagetool](https://github.com/languagetool-org/languagetool) for grammer check
3. more [Linters](https://github.com/iamcco/diagnostic-languageserver/wiki/Linters) config example.

coc-settings.json:

``` jsonc
{
  "languageserver": {
    "dls": {
      "command": "diagnostic-languageserver",
      "args": ["--stdio"],
      "filetypes": [ "sh", "email", "dart" ],
      "initializationOptions": {
        "linters": {
          "shellcheck": {
            "command": "shellcheck",
            "debounce": 100,
            "args": [ "--format=gcc", "-"],
            "offsetLine": 0,
            "offsetColumn": 0,
            "sourceName": "shellcheck",
            "formatLines": 1,
            "formatPattern": [
              "^[^:]+:(\\d+):(\\d+):\\s+([^:]+):\\s+(.*)$",
              {
                "line": 1,
                "column": 2,
                "message": 4,
                "security": 3
              }
            ],
            "securities": {
              "error": "error",
              "warning": "warning",
              "note": "info"
            }
          },
          "languagetool": {
            "command": "languagetool",
            "debounce": 200,
            "args": ["-"],
            "offsetLine": 0,
            "offsetColumn": 0,
            "sourceName": "languagetool",
            "formatLines": 2,
            "formatPattern": [
              "^\\d+?\\.\\)\\s+Line\\s+(\\d+),\\s+column\\s+(\\d+),\\s+([^\\n]+)\nMessage:\\s+(.*)$",
              {
                "line": 1,
                "column": 2,
                "message": [4, 3]
              }
            ],
          }
        },
        "formatters": {
          "dartfmt": {
            "command": "dartfmt",
            "args": [ "--fix" ],
          }
        },
        "filetypes": {
          "sh": "shellcheck",
          "email": "languagetool"
        },
        "formatFiletypes": {
          "dart": "dartfmt"
        }
      }
    }
  }
}
```

## TODO

- [x] local node_modules linter support like eslint or textlint
- [x] diagnostic severity
- [x] root pattern
- [x] document format

## References

- inspired by [efm-langserver](https://github.com/mattn/efm-langserver)

### Buy Me A Coffee ☕️

![btc](https://img.shields.io/keybase/btc/iamcco.svg?style=popout-square)

![image](https://user-images.githubusercontent.com/5492542/42771079-962216b0-8958-11e8-81c0-520363ce1059.png)
