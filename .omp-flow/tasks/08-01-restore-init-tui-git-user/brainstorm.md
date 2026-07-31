---
type: "Brainstorm"
title: "Brainstorm: 恢复 init TUI 与 Git 用户初始化"
---

# Brainstorm: 恢复 init TUI 与 Git 用户初始化

## 现场事实

Linux 用户从 npm 安装 `omp-flow@0.2.3` 后运行：

```text
omp-flow init -u sikjmyhre
Select harnesses (comma-separated: omp,codex,claude) [omp,codex,claude]: codex，claude
[omp-flow Error] Unknown harness: codex，claude
```

用户预期的是艺术 Banner、方向键/空格多选、回车确认的初始化界面；`-u` 用于与 Git 名称
对应的身份初始化，不应被静默忽略。

## 第一性锚定

初始化是产品的第一接触面。内部精简只有在不损失可发现性、可选择性和参数语义时才是
优化；让用户手写逗号协议不是等价替代。

当前主要矛盾是轻量依赖与可靠跨平台 TTY 交互之间的取舍。最强反假设是：无需恢复依赖，
只要接受全角逗号或文档说明 flags 即可。现场反馈反证了这一点——问题是交互界面消失，
不仅是分隔符兼容。

## 已选方向

- TTY 且未显式给 Harness flags：显示现有艺术 Banner，使用成熟 checkbox 交互；
- `--omp --codex --claude`：保持无提示的脚本/CI 路径；
- 非 TTY 且无 Harness flags：继续 fail closed，提示显式 flags；
- `-u/--user <name>`：显式设置当前仓库 local `git config user.name`；未传时读取现有 Git
  配置作为显示身份，不创建重复身份数据库；
- init 的未知 option 立即报错，不再静默吞掉；
- 目标 `0.2.4`，不重做 update/flow-status，也不恢复退役 workspace。

详细证据见[初始化回归与 Trellis 适配](research/init-tui-trellis.md)。
