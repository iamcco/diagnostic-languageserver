# diagnostic-languageserver

> General purpose Language Server that integrate with
> linter to support diagnostic features

![image](https://user-images.githubusercontent.com/5492542/54408361-a1c1cd80-471c-11e9-8498-d7d928a40e28.png)

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
      "filetypes": [ "vim", "email" ], // filetypes that you want to enable this lsp
      "initializationOptions": {
        "linters": {
          ...
        },
        "filetypes": {
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
  "linterName": {                         // linter name, for example: vint
    "command": "vint",                    // linter command
    "debounce": 100,                      // debounce time
    "args": [ "--enable-neovim", "-"],    // args
    "offsetLine": 0,                      // offsetline
    "offsetColumn": 0,                    // offsetColumn
    "sourceName": "vint",                 // source name
    "formatLines": 1,                     // how much lines for formatPattern[0] to match
    "formatPattern": [
      "[^:]+:(\\d+):(\\d+):\\s*(.*$)",    // line match pattern (javascript regex)
      {
        "line": 1,                        // diagnostic line use match group 1
        "column": 2,                      // diagnostic column use match group 2
        "message": [3]                    // message to display use match group 3
      }
    ]
  }
}
```

`filetypes` field:

```jsonc
{
  "vim": "linterName",                          // filetype: linterName or linterName[]
}
```

## How to config a new linter

vint for example:

test.vim:

``` vim
function a() abort
endfunction
```

then:

```bash
vint test.vim
```

output:

```text
t.vim:1:10: E128: Function name must start with a capital or contain a colon: a (see vim-jp/vim-vimlparser)
```

write pattern to match the line for `line` `column` `message`:

```javascript
const line = "t.vim:1:10: E128: Function name must start with a capital or contain a colon: a (see vim-jp/vim-vimlparser)"
const formatPattern = "[^:]+:(\\d+):(\\d+):\\s*(.*$)"
const match = line.match(new RegExp(formatPattern))
console.log(match)
```

output:

```text
{
  0: "t.vim:1:10: E128: Function name must start with a capital or contain a colon: a (see vim-jp/vim-vimlparser)"
  1: "1"
  2: "10"
  3: "E128: Function name must start with a capital or contain a colon: a (see vim-jp/vim-vimlparser)"
}
```

so you got:

- `line`: `match[1]`
- `column`: `match[2]`
- `message`: `match[3]`

and your `formatPattern` field will be:

```jsonc
"formatPattern": [
  "[^:]+:(\\d+):(\\d+):\\s*(.*$)",    // line match pattern (javascript regex)
  {
    "line": 1,                        // diagnostic line use match group 1
    "column": 2,                      // diagnostic column use match group 2
    "message": [3]                    // message to display use match group 3
  }
]
```

> **Notes**
> if the linter's message for per issue more then one line, you have to set the `formatLines` to fill your pattern,
> and you can view the languagetool pattern for example which `formatLines = 2`

## Example with [coc.nvim](https://github.com/neoclide/coc.nvim)

1. [vint](https://github.com/Kuniwak/vint) for vim
2. [languagetool](https://github.com/languagetool-org/languagetool) for grammer check
3. see all [Linters](https://github.com/iamcco/diagnostic-languageserver/wiki/Linters) list config example.

coc-settings.json:

``` jsonc
{
  "languageserver": {
    "dls": {
      "command": "diagnostic-languageserver",
      "args": ["--stdio"],
      "filetypes": [ "vim", "email" ],
      "initializationOptions": {
        "linters": {
          "vint": {
            "command": "vint",
            "debounce": 100,
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
        "filetypes": {
          "vim": "vint",
          "email": "languagetool"
        }
      }
    }
  }
}
```

## References

- inspired by [efm-langserver](https://github.com/mattn/efm-langserver)

### Buy Me A Coffee ☕️

![btc](https://img.shields.io/keybase/btc/iamcco.svg?style=popout-square)

![image](https://user-images.githubusercontent.com/5492542/42771079-962216b0-8958-11e8-81c0-520363ce1059.png)
