# Python小工具：可选参考说明

以下是答案，建议先独立尝试，再按需查看。所有姓名、邮箱和报名记录均为虚构练习数据，三个项目各 **2人只是演示容量**。活动设定中的手机摄影工作坊是20名，两者不能混用。

## 你要完成什么

`starter.py`已经完成CSV读写、命令行与报表。只补两个函数，核心约30行：

- `normalize_id(value)`：去掉两端空白并转小写。也用于邮箱、项目代码与状态。
- `allocate_requests(rows, capacities)`：返回逐行结果列表与各项目录取人数，不修改输入。参考实现可在`tool-reference.py`中任选阅读。

按CSV**出现顺序**处理，不能按id排序。id和邮箱分别作为重复标识，任何一项与先前有效报名相同都记`duplicate`。同一邮箱改大小写或两端加空格，仍是同一个人；同id换邮箱仍是重复。姓名去两端空白后须2—20字；id非空；邮箱恰好一个`@`，两侧非空且无空白；项目存在且状态为`active`。这些是本练习的简化规则，不是完整的真实邮箱验证。

先判断`cancelled`，再判断`invalid`，再判断`duplicate`，最后录取或候补。取消与无效行不占名额，也不占去重位置；有效候补占去重位置。数据是**报名快照**，一行`cancelled`表示该行已经取消，不是删除之前行的事件。项目未满时记`accepted`并加一人，已满时记`waitlist`。人数表包括全部项目，即使某个项目为0人。

## 12行样例预期

| CSV数据行 | 规范化id | 结果 | 原因 |
|---:|---|---|---|
| 1 | r009 | accepted | 摄影第1名 |
| 2 | r002 | accepted | 摄影第2名；id较小也不会排到第1行前面 |
| 3 | r009 | duplicate | id与邮箱均在规范化后重复 |
| 4 | r001 | waitlist | 摄影满员 |
| 5 | r007 | cancelled | 该记录已取消，不占Python名额 |
| 6 | r004 | accepted | Python第1名 |
| 7 | r003 | invalid | 邮箱没有`@` |
| 8 | r010 | invalid | 姓名只有空格 |
| 9 | r012 | accepted | 剪辑第1名 |
| 10 | r006 | accepted | 剪辑第2名 |
| 11 | r011 | waitlist | 剪辑满员 |
| 12 | r005 | accepted | 先前取消行不占邮箱去重位置，Python第2名 |

总计：`accepted=6`、`waitlist=2`、`duplicate=1`、`cancelled=1`、`invalid=2`。三个项目的录取人数都是2，余位都是0；摄影候补1、Python候补0、剪辑候补1。输出共12行，每行有一个结果，输出中的id、邮箱、项目代码已规范化。

## 运行与验收

需要Python 3.10或更新版本，无需第三方包。在材料文件夹打开终端：

```powershell
python starter.py
python starter.py --check
# 或直接检查你修改后的文件
python check_tool.py starter.py
```

未完成的起始文件会清楚提示两个函数尚未实现，验收失败是预期行为。补完后应显示 **8/8通过**。验收覆盖按行顺序、id与邮箱去重、姓名/邮箱规则、取消、满员/零容量、12行样例及命令行输出汇总；它运行你指定的文件，不只检查参考答案。

正常运行默认只把结果写入与脚本同目录的`learner-output`：`allocations.csv`（逐行结果）、`summary.csv`（项目人数与候补）、`totals.csv`（五类结果总计），不会改写输入CSV。你无需另写报表。可用以下命令自选输出目录，文件夹若有同名输出会被覆盖：

```powershell
python starter.py --output ./my-output
```

`--check`临时文件默认写在`learner-output`下，结束后删除临时子目录。要把验收过程放在另一个目录，可用`python check_tool.py starter.py --work-dir ./my-checks`，或`python starter.py --check --output ./my-checks`。验收本身不会留下分配报表。

## 做完后的体验记录

不把是否一次通过当职业结论。记录：哪一处规则最让你投入？排查边界和重复数据时是否愿意继续？得到提示后能否说明自己修改了什么？若再给30分钟，你想主动改进什么？
