"""职业试玩：给校园技能交换日分配名额（虚构数据，45分钟）。

只补 normalize_id 和 allocate_requests 两处核心，预计约30行。
5分钟澄清，15分钟实现，15分钟反馈与复核，10分钟交接回顾（最后5分钟记录体验）。
容量变更与使用交接见 development-workflow.md；半成品也保留实际进度。
无需安装第三方包；CSV读写、输出汇总和命令行已经完成。

规则：按CSV出现顺序处理，id和email去两端空格并转小写。
取消行直接记 cancelled，不占名额，也不占去重位置。
active行须有id；姓名去空白后2—20字；email恰好一个@、两侧非空、
无任何空白；workshop须存在。无效行记 invalid，不占去重位置。
有效行的id或email与之前有效行相同，记 duplicate，不占名额。
否则占用去重位置；项目未满记 accepted，已满记 waitlist。
候补也占去重位置。后续取消行不是撤销先前行的事件：这是报名快照。

运行：python starter.py
验收：python starter.py --check
自选路径：python starter.py --output ./my-output
参考答案：tool-reference.py（尝试后可任选阅读）。
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path

RESULT_FIELDS = ["row_number", "id", "name", "email", "workshop", "result"]
OUTCOMES = ["accepted", "waitlist", "duplicate", "cancelled", "invalid"]


def normalize_id(value: str) -> str:
    """规范化id；同一函数也用于邮箱及项目代码。补写函数核心。"""
    raise NotImplementedError("请先完成 normalize_id")


def allocate_requests(rows: list[dict], capacities: dict[str, int]) -> tuple[list[dict], dict[str, int]]:
    """返回(逐行结果, 各项目已录取人数)，不修改rows或capacities。

    结果每行含 RESULT_FIELDS；row_number从1开始，id/email/workshop
    规范化，name去两端空白。result使用OUTCOMES中的英文代码。
    提示1：准备人数表、两个去重集合、结果列表。
    提示2：按“取消→无效→重复→有名额/候补”的顺序判断。
    提示3：只在accepted分支增加人数；每一行都应产生一个结果。
    """
    raise NotImplementedError("请完成 allocate_requests；文件读写已替你做好")


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_capacities(path: Path) -> dict[str, int]:
    capacities = {}
    for row in read_csv(path):
        workshop = row["workshop"].strip().lower()
        capacity = int(row["capacity"])
        if not workshop or workshop in capacities or capacity < 0:
            raise ValueError("项目代码须唯一且非空，容量须为非负整数")
        capacities[workshop] = capacity
    return capacities


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_outputs(output: Path, results: list[dict], counts: dict[str, int], capacities: dict[str, int]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    write_csv(output / "allocations.csv", RESULT_FIELDS, results)
    summary = []
    for workshop, capacity in capacities.items():
        waiting = sum(row["workshop"] == workshop and row["result"] == "waitlist" for row in results)
        summary.append({"workshop": workshop, "capacity": capacity, "accepted": counts[workshop],
                        "waitlist": waiting, "remaining": capacity - counts[workshop]})
    write_csv(output / "summary.csv", ["workshop", "capacity", "accepted", "waitlist", "remaining"], summary)
    totals = Counter(row["result"] for row in results)
    write_csv(output / "totals.csv", ["result", "count"], [{"result": item, "count": totals[item]} for item in OUTCOMES])
    print("处理完成：" + "，".join(f"{item}={totals[item]}" for item in OUTCOMES))
    print(f"输出文件夹：{output.resolve()}")


def main() -> int:
    folder = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="校园技能交换日名额分配练习；输入为报名快照")
    parser.add_argument("--requests", type=Path, default=folder / "requests.csv")
    parser.add_argument("--capacities", type=Path, default=folder / "workshop-capacity.csv")
    parser.add_argument("--output", type=Path, default=folder / "learner-output", help="输出目录；--check时为临时验收目录的父目录")
    parser.add_argument("--check", action="store_true", help="验收当前这个文件，无需另装包")
    args = parser.parse_args()
    if args.check:
        from check_tool import run_checks
        return run_checks(Path(__file__).resolve(), args.output)
    try:
        capacities = read_capacities(args.capacities)
        results, counts = allocate_requests(read_csv(args.requests), capacities)
        write_outputs(args.output, results, counts, capacities)
    except (NotImplementedError, ValueError, KeyError, OSError) as error:
        print(f"还未完成或输入有问题：{error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
