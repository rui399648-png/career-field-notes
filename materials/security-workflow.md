# 安全分析：从告警到可交接的判断

材料版本：security-v1。来源访问：2026-10-07。全部后台、角色、ID、设备、IP和数据为独立教学模拟，与摄影报名题的活动信息、名额和统计无关。

你是「校园活动协调演示后台」的安全分析助理。目标是保护管理员权限和演示排班资料，同时减少对正常工作的不必要打断。只读材料，提出排查和响应建议；模拟值班负责人审批、平台同事执行。本题没有真实账号、凭据或个人资料，也不需要安装、付费或联网操作。

[离线告警与日志桌面](security-desk.html)可直接用浏览器打开；也可读[事件CSV](security-events.csv)和[告警CSV](security-alerts.csv)。页面内嵌相同数据，不读取本地CSV文件，不提供最终分类或处置按钮。

## 45分钟：最低成果

| 用时 | 动手做什么 | 留下什么 |
| --- | --- | --- |
| 0–5分钟 | 读brief、角色和字段，写先保护的风险。 | 一句目标与先查理由。 |
| 5–20分钟 | 排查6张告警，关联一宗事件，写两条追问；先保存V1。 | 6行初判；一宗至少4个时间线节点，每个引用E行号；两条具体问题。 |
| 20–35分钟 | 打开补充上下文C01–C06，核对自己的问题，保存V2。 | 初判→修改/坚持及证据；明确仍未解决的缺口。 |
| 35–40分钟 | 给模拟值班负责人交接。 | 至少两条有限响应建议，写审批/执行人、业务影响、验证办法和待办回报时间。 |
| 40–45分钟 | 分开记录查证、追问、改判和解释风险的感受。 | 兴趣/疲劳与完成程度分开。 |

用要点即可，不需要写长报告。时间到时，留下已有记录、未完成项和下一步；部分完成也可以结束本轮，不能把缺少证据改写成肯定结论。可选加做20分钟单独记录。

## 第一步：角色、资源与分级

| 角色 | 本题权限 | 样例 |
| --- | --- | --- |
| member | 登录并读取演示排班 `demo-calendar` | member_01 至 member_05 |
| admin | 读取管理员页面 `admin-console`，可导出虚构条目 `demo-roster` | admin_01 |
| service | 定时同步演示排班 | sync_01 |
| monitor | 提供采集器健康事件，不是人的登录记录 | collector_01 |

本题采样不是完整历史；E01–E04只提供少量基线。材料不含真实名单或密码。IP使用IANA文档地址块，**不要查询其实际归属或地理位置**。设备ID只是本题的合成标记，不证明设备在任何真实系统中可信。

本题分级：P1＝高影响或正在发生，立即请负责人介入；P2＝尽快核实；P3＝目前影响低或已有解释，跟踪/转运维。它们是教学约定，不是统一行业SLA。另写置信度高/中/低和结论：需升级的未授权活动、已解释的预期活动、已解释的运维故障、待核实、技术误报。

优先级说“多快处理”，置信度说“有多大把握”。高影响、低把握的告警也可以先核实。本人正常操作、新设备等得到核实后可写“已解释的预期活动”；配置错误造成的真实失败应写“已解释的运维故障”，另跟踪恢复验收，不必都叫技术误报。

## 字段字典

| 字段 | 本题含义 |
| --- | --- |
| row_id / alert_id | E01–E24是事件编号，A01–A06是告警编号。引用这些编号即可，不依赖电子表格的屏幕行数。 |
| time | ISO 8601时间，统一为 `+08:00`。事件日期均为2026-10-07；告警CSV中的time是触发时间，队列在10:36汇总，关联证据可包含触发后新增的事件。 |
| actor_id / role | 虚构账号/采集器与权限类型。 |
| source_ip / device_id | 合成出口和设备标记；IP变化不等于人物位置变化。 |
| event_type / resource | 登录login、同步sync、读read、导出export、采集健康log_health；resource是目标资源。 |
| result / reason | 成功success、失败failure、采集提示warning；bad_password=密码未通过，invalid_credential=凭据未通过，allowed=动作被应用允许，legacy_entry=旧入口，heartbeat_gap=采集心跳异常。原因不等于攻击结论。 |
| mfa | passed=完成MFA；denied=拒绝MFA；not_reached=未进入MFA步骤；not_required=该次登录策略未要求MFA；not_applicable=此类动作不单独记录MFA。材料没有完整认证链，denied不证明密码正确或账号已失守。 |
| session_id | 本题提供的关联号。T开头只关联失败尝试，不能当作已认证会话；S开头关联成功会话及应用动作。S40可对照登录/读取/导出，并不证明是谁操作。none=监控事件无会话。 |
| event_rows / actors | 告警关联的E编号与涉及的ID，竖线分隔。相关告警可能重用同一证据，不应重复计算攻击数量。 |

仅看失败次数、IP或MFA状态不能判断攻击或安全。成功导出说明应用记录了该动作；它不独自证明数据向外部发送。没有后续记录也可能是日志缺失。

## 第二步：6张告警与初始证据

下面没有补充回复或最终定性。阅读后完成V1与两条请求，再打开下一步。

| 告警 | 触发时间 | 信号 | 关联事件 |
| --- | --- | --- | --- |
| A01 | 10:05 | 同账号三次密码失败后成功 | E01、E05–E09 |
| A02 | 10:10 | 周期同步连续凭据失败 | E04、E10–E13 |
| A03 | 10:13 | 与历史样本设备和出口不同 | E03、E14–E15 |
| A04 | 10:24 | 同设备及出口涉及多账号失败与管理员成功 | E16–E20 |
| A05 | 10:26 | 管理员登录后同会话导出虚构排班 | E20–E22 |
| A06 | 10:31 | MFA拒绝后出现采集心跳提示 | E23–E24 |

以下是同一24条事件的便读表，所有时间均为 `+08:00`。MFA完整值在CSV/桌面中；简写“无关”=`not_applicable`、“未到”=`not_reached`、“未要求”=`not_required`。

| E编号 | 时间 | ID / 角色 | IP / 设备 | 动作→资源 | 结果 / 原因 | MFA | 关联号 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E01 | 09:40 | member_01 / member | 192.0.2.10 / D01 | login→demo-calendar | success / credential_accepted | passed | S01 |
| E02 | 09:41 | admin_01 / admin | 192.0.2.11 / D10 | login→admin-console | success / credential_accepted | passed | S10 |
| E03 | 09:42 | member_02 / member | 192.0.2.12 / D04 | login→demo-calendar | success / credential_accepted | passed | S02 |
| E04 | 09:43 | sync_01 / service | 192.0.2.20 / D02 | sync→demo-calendar | success / credential_accepted | 无关 | S03 |
| E05 | 10:02 | member_01 / member | 192.0.2.10 / D01 | login→demo-calendar | failure / bad_password | 未到 | T11 |
| E06 | 10:03 | member_01 / member | 192.0.2.10 / D01 | login→demo-calendar | failure / bad_password | 未到 | T11 |
| E07 | 10:04 | member_01 / member | 192.0.2.10 / D01 | login→demo-calendar | failure / bad_password | 未到 | T11 |
| E08 | 10:05 | member_01 / member | 192.0.2.10 / D01 | login→demo-calendar | success / credential_accepted | passed | S11 |
| E09 | 10:06 | member_01 / member | 192.0.2.10 / D01 | read→demo-calendar | success / allowed | 无关 | S11 |
| E10 | 10:07 | sync_01 / service | 192.0.2.20 / D02 | sync→demo-calendar | failure / invalid_credential | 无关 | T12 |
| E11 | 10:08 | sync_01 / service | 192.0.2.20 / D02 | sync→demo-calendar | failure / invalid_credential | 无关 | T12 |
| E12 | 10:09 | sync_01 / service | 192.0.2.20 / D02 | sync→demo-calendar | failure / invalid_credential | 无关 | T12 |
| E13 | 10:10 | sync_01 / service | 192.0.2.20 / D02 | sync→demo-calendar | failure / invalid_credential | 无关 | T12 |
| E14 | 10:12 | member_02 / member | 198.51.100.24 / D03 | login→demo-calendar | success / credential_accepted | passed | S20 |
| E15 | 10:13 | member_02 / member | 198.51.100.24 / D03 | read→demo-calendar | success / allowed | 无关 | S20 |
| E16 | 10:20 | member_03 / member | 203.0.113.70 / D90 | login→demo-calendar | failure / bad_password | 未到 | T31 |
| E17 | 10:21 | member_04 / member | 203.0.113.70 / D90 | login→demo-calendar | failure / bad_password | 未到 | T32 |
| E18 | 10:22 | admin_01 / admin | 203.0.113.70 / D90 | login→admin-console | failure / bad_password | 未到 | T33 |
| E19 | 10:23 | admin_01 / admin | 203.0.113.70 / D90 | login→admin-console | failure / bad_password | 未到 | T34 |
| E20 | 10:24 | admin_01 / admin | 203.0.113.70 / D90 | login→admin-console | success / legacy_entry | 未要求 | S40 |
| E21 | 10:25 | admin_01 / admin | 203.0.113.70 / D90 | read→admin-console | success / allowed | 无关 | S40 |
| E22 | 10:26 | admin_01 / admin | 203.0.113.70 / D90 | export→demo-roster | success / allowed | 无关 | S40 |
| E23 | 10:30 | member_05 / member | 198.51.100.50 / D05 | login→demo-calendar | failure / mfa_denied | denied | T50 |
| E24 | 10:31 | collector_01 / monitor | 192.0.2.99 / LOG01 | log_health→sign-in-log | warning / heartbeat_gap | 无关 | none |

写6行 `告警｜优先级｜置信度｜初判/替代解释｜E编号与理由`。从中选一宗，写至少4个节点 `时间｜E编号｜账号/动作｜解释`；必要时关联另一张告警的行，不被告警卡的边界限制。把直接观察、推测和信息缺口分开。

写两条具体问题：谁能确认这次账号/设备/动作？谁能确认采集覆盖或批准任务？问题包含ID、时间、动作和所需信息。无需联系真人，下一步已准备好模拟回复。

## 第三步：保存V1后，接收上下文并写V2

先保留V1与两条问题，再打开主页反馈卡或[补充上下文C01–C06](security-context.md)。它只提供模拟同事的事实回复，判定由你完成。未能直接回答自己问题的部分，继续写在待办里。

逐项写 `A编号｜V1→V2｜C编号与E编号｜改变/保持理由`。新增上下文可能支持升级、降低误判或继续待核实；不用强行把所有项改成“攻击/安全”两类。保留一项不能据现有材料推出的结论，并标记未覆盖的范围。

## 第四步：交接与回顾

给模拟值班负责人写一份短交接。至少含：事件/告警、优先级和置信度、状态、最关键证据、已知范围和未查范围、两条有限响应建议、审批/执行人、可能打断的业务、如何验证、尚未执行的措施、未决项与回报时间。

建议应与证据相称，并考虑保留原始记录。你本轮没有执行撤销会话、修改凭据、封禁或恢复等处置；不要把建议写成完成事实。记录真实完成度和下一步，再用最后5分钟分别回顾：关联证据是否有吸引力？请求更多信息和修正自己判断是否消耗？向人解释风险是否想再试？

完成后可对照[完整参考](security-reference.md)。可选+20分钟：提出一种告警分组/策略调整，写一个良性例和一个高影响反例，检查对未知项的处理，再补交接；不要求编码或安装安全工具。

## 职责来源与适用边界

[百度成都安全工程师校招](https://talent.baidu.com/jobs/detail/GRADUATE/ea157b5c-f6ce-4f19-8981-81572b11bd5a)包含事件响应、风险与数据安全运营；[百度北京安全工程师实习](https://talent.baidu.com/jobs/detail/INTERN/d8801b7e-0929-4b2f-ae65-8048d4b5297a)包含风险发现、应急与协作。已读雇主职责和资格全文；前者本科及以上、需编程及安全方向基础，后者要求计算机基础与相关安全实践。只抽取分析工作链条，不把45分钟成果当成达到招聘门槛，也不承诺页面当前可投。

[NIST 800-61r3官方最终版](https://csrc.nist.gov/pubs/sp/800/61/r3/final)提供验证/分级、事件分析、证据记录与协调响应；[Microsoft身份风险调查](https://learn.microsoft.com/zh-cn/entra/id-protection/howto-identity-protection-investigate-risk)提供历史比较、动作关联、用户核实与更新风险状态；[登录字段说明](https://learn.microsoft.com/zh-cn/entra/identity/monitoring-health/concept-sign-in-log-activity-details)说明IP位置和时区的解释限制；[IANA文档IP登记](https://www.iana.org/assignments/iana-ipv4-special-registry)支持示例地址的选择。练习中全部事件、反馈、分级和工时是原创教学安排。

本题未模拟生产值班、真实取证、攻防或实际恢复。所有操作保持离线；不扫描、攻击任何目标，不接入真实账号或上传个人数据。来源和单份岗位样本不能证明国内热门排名、薪资或岗位数量。
