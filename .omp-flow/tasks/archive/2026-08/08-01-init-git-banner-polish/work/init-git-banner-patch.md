---
type: "Work"
title: "完成首次初始化与宽屏品牌展示"
---

# 完成首次初始化与宽屏品牌展示

## Objective and scope

实现 [PRD](../prd.md) 和 [Design](../design.md)：修改 `src/cli/init.ts`、
`src/cli/banner.ts`、直接测试、README、package/lock version，形成 `0.2.5` 补丁。

不修改 Harness Adapter、Codex Hooks、Flow Status、Git global config 或 identity 状态模型。
预期 handoff：`work/init-git-banner-patch-handoff.md`。

## Done

- 无 Git 普通目录：显式 `-u` 在 Harness 成功选择后静默 bootstrap，local name 和资源正确；
- dry-run / 取消 / 空选择 / 无 `-u`：不创建 `.git`；Git 启动/init/config 错误显式传播；
- 76、52、28、27 列精确命中五行、三行、两行、单行，76 列每行不溢出；
- existing repo、strict args、TTY/non-TTY 与 `0.2.4` 合同继续通过；
- build、378+ checks、Python compile、pack、diff-check 与 production tarball no-Git smoke 通过。
