# matugen 模板：Miyu 网页「跟随壁纸」

用 matugen 换壁纸的，照这个模板多生成一份：网页的主题「跟随壁纸」取它算出的主色（`source`，和桌面上别的软件同一个主色），再照网页自己的规矩生成整套颜色（和终端一样）。没有这一份的，网页自己读壁纸取色。旧模板生成的、带着各个角色的那一份照样认，只读里面的 `source`。

## 接上

1. 把模板拷到 matugen 的模板目录：

   ```sh
   cp <网页包目录>/matugen/miyu-web.json ~/.config/matugen/templates/
   ```

   网页包目录：源码里是这个仓库的 `web/`；装好的是资源目录下的 `packages/web/`。

2. 在 `~/.config/matugen/config.toml` 末尾加一节（`output_path` 照你的系统写，网页只认这个地方）：

   ```toml
   [templates.miyu-web]
   input_path = '~/.config/matugen/templates/miyu-web.json'
   output_path = '~/.cache/miyu/matugen.json'
   ```

   | 系统 | `output_path` |
   |---|---|
   | Linux | `~/.cache/miyu/matugen.json`（设了 `XDG_CACHE_HOME` 的是 `$XDG_CACHE_HOME/miyu/matugen.json`） |
   | macOS | `~/Library/Caches/miyu/matugen.json` |
   | Windows | `%LOCALAPPDATA%\miyu\matugen.json` |

3. 让 matugen 跑一次：换一次壁纸，或者 `matugen image <壁纸>`。
4. 网页：设置 → 通用 → 主题，选「跟随壁纸」。以后每次 matugen 换色，网页当场跟着换（网页服务盯着这个文件，变了推给页面，不定时去问）。终端的「跟随壁纸」也照这份输出。

## 不用了

删掉 `output_path` 那个文件（也可以把 config.toml 里那一节删掉），网页就回去自己读壁纸取色。
