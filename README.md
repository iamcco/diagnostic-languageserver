# diagnostic-languageserver

> General purpose Language Server that integrate with linter to support diagnostic features

## Install

``` bash
yarn global add diagnostic-languageserver
```

## Document

``` javascript
"fileType": {
  "command": "vint",                    // linter command
  "args": [ "--enable-neovim", "-"],    // args
  "offsetLine": 0,                      // offsetline
  "offsetColumn": 0,                    // offsetColumn
  "sourceName": "vint",                 // source name
  "formatLines": 1,                     // how many lines for formatPattern[0] to match
  "formatPattern": [
    "[^:]+:(\\d+):(\\d+):\\s*(.*$)",    // line match pattern
    {
      "line": 1,                        // diagnostic line use match group 1
      "column": 2,                      // diagnostic column use match group 2
      "message": [3]                    // message to display use match group 3
    }
  ]
}
```

## Usage

1. [vint](https://github.com/Kuniwak/vint) for vim
2. [languagetool](https://github.com/languagetool-org/languagetool) for grammer check

Setup with [coc.nvim](https://github.com/neoclide/coc.nvim):

coc-settings.json:

``` json
{
  "languageserver": {
    "dls": {
      "command": "diagnostic-languageserver",
      "args": ["--stdio"],
      "filetypes": [ "vim", "email" ],
      "initializationOptions": {
        "vim": {
          "command": "vint",
          "args": [ "--enable-neovim", "-"],
          "offsetLine": 0,
          "offsetColumn": 0,
          "sourceName": "vint",
          "formatLines": 1,
          "formatPattern": [
            "[^:]+:(\\d+):(\\d+):\\s*(.*$)",
            {
              "line": 1,
              "column": 2,
              "message": 3
            }
          ]
        },
        "email": {
          "command": "languagetool",
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
      }
    }
  }
}
```

## References

- inspired by [efm-langserver](https://github.com/mattn/efm-langserver)
