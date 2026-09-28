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

## 中文对应意图

### 最终确认范围

维护者将导航收敛为五主菜单和七园区页，并明确“好，按照这个来实现吧。代码可以随意
重构。”取代历史七菜单方案。地图/模型/网关为全局资源，实例/作业/分析在园区，
一个园区可关联多图、多网关、多模型版本，虚拟与物理实例严格隔离执行。明确选择
可信局域网单用户免登录，不设账号/凭证。本次实施许可不自动包含提交、推送或实机
控制；现状以园区手册为准。

### 保留的初稿，不是当前待批事项

最初八点需求提出地图、可编辑产品模型、实物实例、可配网关、仿真/物理工作空间、
业务对象及全流程分析；仿真、驾驶算法、力学优先，物理空间未来监控、定位和接管。
不是 A/B/C/D 改名，虽可复用引擎、队列、查看、回放和报告，但需独立领域和版本。

约束：单独仓库、保留历史/用户未提交工作；五地图继续用，第六待补；地图、模型、
实例、实验分开；实测数据不是仿真数据，要保留来源、时钟、坐标系；不因重构授权
任意可执行上传、自动用凭证、实车命令、接管或公网；仅存模型不能声称厂商真实性、
感知、算法验证或已连接。历史四模块只作内部能力/旧入口，不重写旧实验。

初稿当时请求 P1 持久资源和编辑、P2 选图仿真分析，并询问是否真实单管理员登录；
这些问题后来已由五菜单及免登录选择取代。网关登记/数据契约先做，真实流和接管
仍需单独集成与安全验收；不能把保留的“待确认”当成今天未获实施授权。
