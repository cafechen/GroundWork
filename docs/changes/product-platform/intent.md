# Product platform refactor — intent / 产品平台重构意图

## Accepted revision / 已确认的新范围

The maintainer subsequently refined and approved **five** main menus: 总览、地图管理、
设备模型管理、接入网关、园区管理; park detail contains 园区概览、场景编辑、设备实例、
作业管理、控制面板、统计分析、园区配置. Latest authorization: “好，按照这个来实现吧。
代码可以随意重构。” This supersedes the seven-menu/workspace proposal below.
Implementation is authorized; no commit/push or real-device control is implied.
Map/model/gateway resources are global; instances/operations/analysis belong to a
park. A park can contain multiple maps/gateways/model versions and both virtual
and physical instances with strict execution separation. Maintainer answered:
“先保留可信局域网单用户预览（推荐）”. No login/credentials this batch.
Current behavior and delivery limits: [product guide](../../park-platform.md).

## Historical initial draft (superseded) / 以下为已取代的初稿

The following planning-stage text is retained as history. Its pending approval,
seven-menu and login proposals are not the active scope or current implementation status.

Status: proposed; user direction accepted as the request, detailed implementation
scope not yet approved. No runtime implementation or deployment in this planning turn.
状态：方案待确认；用户本轮八点业务描述是需求来源，不伪造对新增技术方案的确认。

## Request / 请求

The maintainer requests replacing the A/B/C/D product navigation with a platform
organized around maps, editable product models, physical device instances,
configurable gateways, simulation/physical workspaces, operational objects and
end-to-end analysis. Simulation workspaces, driving algorithms and mechanics
validation are the priority. Physical workspaces eventually support observation,
fault investigation and remote takeover.

本次不是给 A/B/C/D 换名字。已有引擎、地图查看、作业队列、回放和报告可复用，
但产品资产、实例、工作空间、编辑状态、版本绑定与数据来源需建立独立领域对象。

## Constraints / 约束

- One independent GroundWork repository; preserve existing assets and experiment
  history. Existing uncommitted work belongs to the maintainer and is not reset.
- Five imported RMF maps remain usable; the sixth remains unavailable.
- Map data, model definition, runtime instance and experiment are different objects.
- Real-world telemetry is measured data, not simulated data. Reuse analysis schemas
  without hiding the origin, clock or coordinate frame.
- No arbitrary uploaded executable, automatic cloud credential use, live fleet
  command, remote takeover or public exposure authorized merely by this redesign.
- Do not claim vendor model fidelity, sensor simulation, algorithm validation or
  completed connectivity when only a model/configuration record exists.

## Superseded organization / 取代的组织方式

The current A/B/C/D navigation no longer defines the target product. Its components
map internally to scene editing, engine adapters, operations and analysis. Historical
classic functionality may remain under a legacy entry, without rewriting old runs.
Once the implementation plan is accepted, update README/AGENTS/architecture so the
old four-letter scheme does not constrain the new business model.

## Decision requested / 待确认

Approve the menu/domain design and a two-increment implementation:
P1 persistent resource management plus workspace editing; P2 a genuine selected-map
simulation/analysis loop, prioritizing the existing towing/forklift topology.
Physical gateway registration/data contracts are designed now, but production
stream ingestion and takeover require separate integration and safety acceptance.
Confirm whether actual account login is required in P1 (proposed: single-admin
login; no multi-tenant/billing system). See [spec](spec.md) and [plan](plan.md).
