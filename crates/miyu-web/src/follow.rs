//! 网页软件自己跟着核心的配置换监听（`web-ui.md`「怎么走」第一条第 11 款，2026-10-30）：设置页、`miyu config set`、手改配置文件改了
//! `web.listen`、`web.port`，都当场换，不靠哪个页面来请（页面开在旧端口上的请不到，关了局域网却还听着局域网就不对了）。
//!
//! 照终端的样子连核心（出示本机令牌，同起来时读配置；不拉起核心），订配置的推送（`subscribe {stream: "config"}`），先读一遍、换一遍，
//! 以后推来的 `config.changed` 里有这两项的、掉了队的（`resync`）再读一遍、换一遍（[`crate::listen::apply`]）。核心不在、断了：过一会儿
//! 再连（核心重启以后接着跟）。

use std::sync::Arc;
use std::time::Duration;

use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader, Lines};

use crate::serve::Site;
use crate::{TARGET, listen};

/// 跟着的两项。
const KEYS: [&str; 2] = ["web.listen", "web.port"];

/// 核心不在、断了，过多久再连。
const AGAIN: Duration = Duration::from_secs(10);

/// 一直跟着，直到网页软件停（这个任务随它一起丢掉）。
pub(crate) async fn follow(site: Arc<Site>) {
    loop {
        if let Err(why) = once(&site).await {
            tracing::debug!(target: TARGET, why, "config not followed");
        }
        tokio::time::sleep(AGAIN).await;
    }
}

/// 连一次：握手、订推送，读一遍换一遍，再照推送跟，直到断。交回为什么断。
async fn once(site: &Arc<Site>) -> Result<(), String> {
    let (connection, token) = miyu_client::connect::connect(&site.root)
        .await
        .map_err(|error| error.to_string())?;
    let (read, write) = tokio::io::split(connection);
    let mut link = Link {
        lines: BufReader::new(read).lines(),
        write,
        next: 0,
    };
    let head = json!({"kind": "miyu-web", "version": env!("CARGO_PKG_VERSION")});
    link.call(
        "hello",
        json!({"protocol": [1, 1], "token": token, "head": head}),
    )
    .await?;
    loop {
        link.call("subscribe", json!({"stream": "config"})).await?;
        loop {
            let got = link.call("config.get", json!({"keys": KEYS})).await?;
            if let Err(why) = listen::apply(site, &got["items"]).await {
                tracing::warn!(target: TARGET, why, "listen not changed");
            }
            match link.wait().await? {
                Push::Changed => {}
                Push::Resync => break,
            }
        }
    }
}

/// 推来的、要再读一遍的。
enum Push {
    /// 那两项变了。
    Changed,
    /// 掉了队：重新订，再读。
    Resync,
}

/// 一条到核心的连接：一行一条。
struct Link<R, W> {
    lines: Lines<BufReader<R>>,
    write: W,
    next: u64,
}

impl<R: AsyncRead + Unpin, W: AsyncWrite + Unpin> Link<R, W> {
    /// 问一句，等这一句的回应（中间推来的不管：读完以后整个再读一遍）。
    async fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next += 1;
        let id = format!("web-{}", self.next);
        let request = json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params});
        self.write
            .write_all(format!("{request}\n").as_bytes())
            .await
            .map_err(|error| error.to_string())?;
        loop {
            let reply = self.read().await?;
            if reply["id"] != json!(id) {
                continue;
            }
            return match reply.get("result") {
                Some(result) => Ok(result.clone()),
                None => Err(reply["error"]["message"]
                    .as_str()
                    .unwrap_or("refused")
                    .to_string()),
            };
        }
    }

    /// 等到推来的 `config.changed` 里有那两项、或者掉了队。
    async fn wait(&mut self) -> Result<Push, String> {
        loop {
            let push = self.read().await?;
            match push["method"].as_str() {
                Some("resync") if push["params"]["stream"] == json!("config") => {
                    return Ok(Push::Resync);
                }
                Some("config.changed") if touches(&push["params"]["keys"]) => {
                    return Ok(Push::Changed);
                }
                _ => {}
            }
        }
    }

    /// 读一行：断了、读不了的交回原因；不是 JSON 的跳过。
    async fn read(&mut self) -> Result<Value, String> {
        loop {
            let line = self
                .lines
                .next_line()
                .await
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "core disconnected".to_string())?;
            if let Ok(value) = serde_json::from_str(&line) {
                return Ok(value);
            }
        }
    }
}

/// 推来的 `keys` 里有没有那两项（整份换只动了注释的 `keys` 是空的，不算）。
fn touches(keys: &Value) -> bool {
    KEYS.iter().any(|key| keys.get(key).is_some())
}
