# matugen 模板：Miyu 网页「跟随壁纸」

用 matugen 换壁纸的，照这个模板多生成一份颜色，网页的主题「跟随壁纸」就照它铺，和桌面上别的软件（kitty、waybar……）一模一样：配色方式（`--type`）、对比度都照你的 matugen 设置。没有这一份的，网页自己读壁纸取色。

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
4. 网页：设置 → 通用 → 主题，选「跟随壁纸」。以后每次 matugen 换色，几秒内网页跟着换。

## 不用了

删掉 `output_path` 那个文件（也可以把 config.toml 里那一节删掉），网页就回去自己读壁纸取色。
