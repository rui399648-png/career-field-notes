# 容量变更：尝试后的参考与交接

以下是虚构练习答案。先保留你的代码、变更前后结果与失败记录，再查看。本轮只改容量配置：摄影3、Python0、剪辑1；快照、全局去重、输入顺序、每行结果规则不变。

## 怎样落实反馈

`allocate_requests(rows, capacities)`必须读取传入容量，不能把2写死。正确实现不一定要改代码；更换容量CSV也能落实请求。原 `workshop-capacity.csv` 保留，新 `workshop-capacity-revised.csv` 的字段及项目代码一致。

在材料文件夹运行你完成的版本：

```powershell
python check_tool.py starter.py
python starter.py --capacities workshop-capacity-revised.csv --output learner-output-revised
```

第一个命令继续验收原规则和原样例，应8/8通过；第二个产生新配置的三份报表。两种检查回答不同的问题，不能只凭旧验收通过就认为新配置生效。

## 新配置的12行预期

| 数据行 | 规范化ID | 新结果 | 对照要点 |
|---:|---|---|---|
| 1 | r009 | accepted | 摄影第1人 |
| 2 | r002 | accepted | 摄影第2人 |
| 3 | r009 | duplicate | ID与邮箱规范化后重复 |
| 4 | r001 | accepted | 摄影第3人；旧配置为候补 |
| 5 | r007 | cancelled | 快照取消，不占去重或名额 |
| 6 | r004 | waitlist | Python容量0，仍保留有效候补 |
| 7 | r003 | invalid | 邮箱无效 |
| 8 | r010 | invalid | 全空格姓名 |
| 9 | r012 | accepted | 剪辑唯一确认名额 |
| 10 | r006 | waitlist | 剪辑已满 |
| 11 | r011 | waitlist | 剪辑已满 |
| 12 | r005 | waitlist | Python容量0；之前取消行不占邮箱去重位置 |

`allocations.csv`仍有12行，顺序与输入一致。总计：**accepted=4、waitlist=4、duplicate=1、cancelled=1、invalid=2**；五类相加是12。

| 项目 | 容量 | 确认 | 候补 | 剩余 |
|---|---:|---:|---:|---:|
| mobile-photo | 3 | 3 | 0 | 0 |
| python-tools | 0 | 0 | 2 | 0 |
| video-edit | 1 | 1 | 2 | 0 |

原配置总计是确认6、候补2；变更后不是简单地把确认总数加一，因为另两项容量同时减少。查失败时先定位一行，再检查判定顺序和该项目容量。

## 一段交接示例

“本版使用修订容量CSV，运行命令如上；程序按输入顺序返回12行，确认4、候补4，其余为重复1、取消1、无效2。旧规则验收通过，新输出已核对。输入是快照，后出现的cancelled不会撤销前面的报名；跨项目仍按ID或邮箱全局去重。输出目录中同名CSV会覆盖。当前没有实时取消事件、数据库或并发控制，不能用于真实上线。若还有失败，请附输入、容量文件和实际结果。”

你自己的说明必须如实填写验收结果；未完成就写未完成，不复制示例中的“通过”。

## 制作时的实际验证

2026-10-06使用同目录 `tool-reference.py` 实际运行：原验收 **8/8通过**；修订容量CLI退出码0。独立核对了12行结果、ID与顺序、三个项目汇总和五类总计，均与上表一致。此结果证明参考样品与预期一致，不能代替验收你修改的 `starter.py`。
