---
type: "QbD 1 Audit"
title: "0.2.5 Git bootstrap 与 Banner 材料性审计"
verdict: "PASS"
---

# 0.2.5 Git bootstrap 与 Banner 材料性审计

审计对象为 [PRD](../prd.md) 与 [Design](../design.md)，范围仅限显式 `-u` 的授权、
prompt/dry-run/错误路径的副作用顺序，以及 76 列五行字形的可实现性。

## Verdict: PASS

当前范围内没有未解决的阻塞发现。

## 材料性检查

1. **显式授权充分。** `-u/--user <name>` 已被产品合同定义为 repository-local Git
   identity 初始化；当目录还不是 worktree 时，创建 `.git` 是让该显式请求成立所需的最小
   副作用。设计同时禁止无 `-u` 自动 bootstrap、global config 和替代 identity 文件，
   因而没有把授权扩展到未表达的范围。
2. **副作用顺序可接受。** 参数验证和 Harness 成功选择均先于 Git 写入；取消或空选择不创建
   仓库。`--dry-run -u` 跳过 Git 与 omp-flow 写操作，只产生预览。非 dry-run 先完成 Git
   bootstrap/local config，成功后才部署资源；失败显式上抛，不会把项目展示为已完成初始化。
   `git init` 成功后若后续步骤失败而保留 `.git`，仍属于显式 `-u` 已授权且可诊断的目标
   副作用，删除它反而会扩大不可逆风险。
3. **76 列方案可实现。** 现有三行布局的可见宽度约为 46 列（`OMP` 17 + connector 9 +
   `FLOW` 20）；固定五行 block 字形可在不增加字符高度之外复杂度的情况下保持远低于 76
   列。设计又要求每行完整容纳并在 76 列做精确测试，因此核心路径是可实现、可验证的。

## 实现期验证义务

- 证明 76 列无色输出去除 ANSI 后每一行可见宽度不超过 76；这属于既定验收，不是新增
  设计门槛。
- 用无 Git 的临时目录验证 Harness 取消、dry-run、Git init/config 失败路径均不制造
  omp-flow 已完成状态。

Codex/OMP Hook parity 按 [选定方向](../finding.md) 明确排除，不构成本审计结论的一部分。
