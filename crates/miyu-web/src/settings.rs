//! 网页软件的数（`web-module.md`「起草时定的」第 25 条，施工 9-1 下改）：端口、空闲多久、`/media` 的票据记多久、最多几张
//! 是配置项，声明在网页自己的清单 `packages/web/package.toml` 的 `[settings]` 里（`packages.md`「配置项」），`serve` 起来时先连核心
//! 问 `config.get` 拿最终值（[`Settings::configured`]）；默认值照清单读。媒体类型的表、页面的内容安全策略是常量，在网页包自己的
//! 文件夹里的 `web.json`（仓库拆开以后从核心的 `resources/web/` 挪进这个仓库的 `web/`，装好在 `packages/web/web.json`）。

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::path::Path;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};

use miyu_client::places::DataRoot;

/// 网页包装好以后在资源目录里的文件夹（这个仓库的 `web/` 照原样放进去）：清单、常量、页面都在这里。
pub const DIR: &str = "packages/web";

/// 常量在资源目录里的位置。
pub const FILE: &str = "packages/web/web.json";

/// 网页自己的清单在资源目录里的位置。
pub const MANIFEST: &str = "packages/web/package.toml";

/// 几项配置的键：`web.<名字>`。
pub const KEYS: [&str; 5] = [
    "web.port",
    "web.listen",
    "web.idle_seconds",
    "web.ticket_idle_seconds",
    "web.most_tickets",
];

/// 读好的一份。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Settings {
    /// 端口（`--port` 能换）。
    pub port: u16,
    /// 听哪个地址（`web.listen`，SU-1）：`127.0.0.1` 只有这台电脑；`0.0.0.0` 局域网也能开；也能是这台电脑的某一个地址。
    pub listen: IpAddr,
    /// 没有 WebSocket 连着、没有媒体在给，连续多少秒就退出。
    pub idle_seconds: u64,
    /// 页面的 `Content-Security-Policy`。
    pub csp: String,
    /// 软件后台页（`/p/`）的 `Content-Security-Policy`：沙箱、不许联网、只许嵌在网页里（施工 F-6 下）。
    pub backstage_csp: String,
    /// 扩展名（小写）→ 媒体类型。`/media` 认页面说的类型也照它：表里出现过的才认（施工 W-10）。
    pub types: BTreeMap<String, String>,
    /// `/media` 的票据多少秒没用过就作废（施工 W-10）。
    pub ticket_idle_seconds: u64,
    /// `/media` 的票据最多几张，满了丢最久没用的（施工 W-10）。
    pub most_tickets: usize,
}

/// `web.json`：只剩常量。
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Constants {
    csp: String,
    backstage_csp: String,
    types: BTreeMap<String, String>,
}

impl Settings {
    /// 读资源目录 `resources` 里网页包的 `web.json` 和清单里几项配置的默认值。
    ///
    /// # Errors
    ///
    /// 读不了、不是这个形状、清单里缺了某一项的默认值：原话里说是哪个文件。
    pub fn load(resources: &Path) -> Result<Settings, String> {
        let path = resources.join(FILE);
        let text = std::fs::read_to_string(&path)
            .map_err(|error| format!("{} not readable: {error}", path.display()))?;
        let constants: Constants = serde_json::from_str(&text)
            .map_err(|error| format!("{} not readable: {error}", path.display()))?;
        let path = resources.join(MANIFEST);
        let text = std::fs::read_to_string(&path)
            .map_err(|error| format!("{} not readable: {error}", path.display()))?;
        let manifest = miyu_client::manifest::read(&text)
            .map_err(|problem| format!("{} not readable: {problem}", path.display()))?;
        let default = |name: &str| {
            manifest
                .settings
                .iter()
                .find(|setting| setting.name == name)
                .and_then(|setting| match setting.default {
                    Some(miyu_client::manifest::Value::Int(value)) => Some(value),
                    _ => None,
                })
                .ok_or_else(|| format!("{}: settings.{name} has no default", path.display()))
        };
        let listen = manifest
            .settings
            .iter()
            .find(|setting| setting.name == "listen")
            .and_then(|setting| match &setting.default {
                Some(miyu_client::manifest::Value::Text(text)) => text.parse::<IpAddr>().ok(),
                _ => None,
            })
            .ok_or_else(|| format!("{}: settings.listen has no address default", path.display()))?;
        Ok(Settings {
            port: number(default("port")?, &path)?,
            listen,
            idle_seconds: number(default("idle_seconds")?, &path)?,
            csp: constants.csp,
            backstage_csp: constants.backstage_csp,
            types: constants.types,
            ticket_idle_seconds: number(default("ticket_idle_seconds")?, &path)?,
            most_tickets: number(default("most_tickets")?, &path)?,
        })
    }

    /// 核心在跑的，问它 `config.get` 换上最终值（施工 9-1 下）。不为这个拉起核心：`miyu web` 先经 `open` 连上核心才拉起
    /// `serve`，核心总在跑；直接起 `serve`、核心没在跑的照默认，记一行 `INFO web config from defaults`。连上了却拒了的照默认，
    /// 记一行 `WARN web config not read`。
    pub async fn from_core(self, root: &DataRoot) -> Settings {
        let mut client = match miyu_client::open::Core::connect_running(root, "miyu-web").await {
            Ok(client) => client,
            Err(error) => {
                tracing::info!(target: crate::TARGET, error = %error, "web config from defaults");
                return self;
            }
        };
        match client
            .call("config", "config.get", json!({"keys": KEYS}))
            .await
        {
            Ok(result) => self.configured(&result["items"]),
            Err(error) => {
                tracing::warn!(target: crate::TARGET, error = %error, "web config not read");
                self
            }
        }
    }

    /// 照核心 `config.get` 交回的 `items`（键到 `{"value", …}`）换上最终值；没有的、不合范围的照旧。
    #[must_use]
    pub fn configured(mut self, items: &Value) -> Settings {
        let value = |key: &str| items[key]["value"].as_i64();
        if let Some(port) = value("web.port").and_then(|port| u16::try_from(port).ok()) {
            self.port = port;
        }
        if let Some(listen) = items["web.listen"]["value"]
            .as_str()
            .and_then(|text| text.trim().parse::<IpAddr>().ok())
        {
            self.listen = listen;
        }
        if let Some(seconds) = value("web.idle_seconds").and_then(|value| u64::try_from(value).ok())
        {
            self.idle_seconds = seconds;
        }
        if let Some(seconds) =
            value("web.ticket_idle_seconds").and_then(|value| u64::try_from(value).ok())
        {
            self.ticket_idle_seconds = seconds;
        }
        if let Some(most) = value("web.most_tickets").and_then(|value| usize::try_from(value).ok())
        {
            self.most_tickets = most;
        }
        self
    }

    /// 空闲多久退出；`0` 是不退（服务器上由服务管理器起的那一份，2026-10-23 Z-1：空闲退了照 `Restart=on-failure` 不会再起）。
    pub fn idle(&self) -> Option<Duration> {
        (self.idle_seconds > 0).then(|| Duration::from_secs(self.idle_seconds))
    }

    /// 路径 `path` 照扩展名的媒体类型；表里没有的是 `application/octet-stream`（`miyu_webserve::pages::type_of`）。
    pub fn type_of(&self, path: &Path) -> &str {
        miyu_webserve::pages::type_of(&self.types, path)
    }
}

/// 清单里的整数换成要的类型。
fn number<T: TryFrom<i64>>(value: i64, path: &Path) -> Result<T, String> {
    T::try_from(value).map_err(|_| format!("{}: default {value} out of range", path.display()))
}

#[cfg(test)]
mod tests;
