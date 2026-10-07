"""验收你的名额分配实现：python check_tool.py starter.py。

仅使用标准库，不改动输入CSV；CLI验收文件写入learner-output下的临时目录，
验收结束删除临时目录。可用 --work-dir 指定其他临时目录父路径。
"""

from __future__ import annotations

import argparse
import copy
import csv
import importlib.util
import subprocess
import sys
import tempfile
from pathlib import Path


def request(identity="A01", name="陈晨", email="chen@example.com", workshop="mobile-photo", status="active"):
    return {"id": identity, "name": name, "email": email, "workshop": workshop, "status": status}


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def equal(actual, expected, message):
    if actual != expected:
        raise AssertionError(f"{message}\n    预期：{expected!r}\n    实际：{actual!r}")


def outcomes(results):
    return [row["result"] for row in results]


def run_checks(source: Path, work_dir: Path | None = None) -> int:
    source = source.resolve()
    try:
        spec = importlib.util.spec_from_file_location("learner_tool", source)
        if spec is None or spec.loader is None:
            raise ValueError("无法读取Python文件")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except Exception as error:
        print(f"FAIL 载入文件：{type(error).__name__}: {error}")
        return 1

    checks = []

    def check(label):
        def register(function):
            checks.append((label, function))
            return function
        return register

    @check("规范化：去两端空格并转小写")
    def normalization():
        equal(module.normalize_id(" A09 "), "a09", "id没有规范化")
        equal(module.normalize_id(" USER@Example.com "), "user@example.com", "邮箱没有规范化")
        equal(module.normalize_id("  "), "", "全空白标识应为空")

    @check("顺序优先：不能按id排序")
    def row_priority():
        rows = [request("Z99"), request("A01", "林青", "lin@example.com")]
        before = copy.deepcopy(rows)
        capacities = {"mobile-photo": 1}
        results, counts = module.allocate_requests(rows, capacities)
        equal(outcomes(results), ["accepted", "waitlist"], "先出现的报名应先录取")
        equal([row["id"] for row in results], ["z99", "a01"], "结果应保持输入顺序并规范化id")
        equal([row["row_number"] for row in results], [1, 2], "行号须从1开始")
        equal(counts, {"mobile-photo": 1}, "人数统计有误")
        equal(rows, before, "不得修改原输入")
        equal(capacities, {"mobile-photo": 1}, "不得修改容量表")

    @check("去重：id或邮箱忽略大小写及两端空白")
    def duplicates():
        rows = [request(), request(" a01 ", "林青", "new@example.com"),
                request("A02", "林青", " CHEN@EXAMPLE.COM "),
                request("A03", "周禾", "zhou@example.com")]
        results, counts = module.allocate_requests(rows, {"mobile-photo": 2})
        equal(outcomes(results), ["accepted", "duplicate", "duplicate", "accepted"], "重复行不得占名额")
        equal(counts, {"mobile-photo": 2}, "重复行影响了人数")
        equal(results[2]["email"], "chen@example.com", "输出邮箱应规范化")

    @check("校验：无效姓名/邮箱/id/项目/状态不分配")
    def invalid_rows():
        rows = [request("", email="empty@example.com"), request("B1", name="陈"),
                request("B2", name="陈" * 21), request("B3", name="   "),
                request("B4", email="bad-email"), request("B5", email="@example.com"),
                request("B6", email="a@"), request("B7", email="a@@example.com"),
                request("B8", email="a b@example.com"), request("B9", workshop="unknown"),
                request("B10", status="pending"), request("B11", name=" 林青 ", email="lin@example.com")]
        results, counts = module.allocate_requests(rows, {"mobile-photo": 1})
        equal(outcomes(results), ["invalid"] * 11 + ["accepted"], "无效行不能分配或消耗名额")
        equal(counts, {"mobile-photo": 1}, "校验失败后人数改变")
        equal(results[-1]["name"], "林青", "姓名应去两端空白")

    @check("取消和无效：不占名额，也不占去重位置")
    def cancellation():
        rows = [request(status="cancelled"), request(email="invalid"), request()]
        results, counts = module.allocate_requests(rows, {"mobile-photo": 1})
        equal(outcomes(results), ["cancelled", "invalid", "accepted"], "取消/无效阻止了后续有效报名")
        equal(counts, {"mobile-photo": 1}, "取消或无效行占用了名额")

    @check("容量边界：满员后候补，候补参与去重，零容量不录取")
    def capacity():
        rows = [request(), request("B02", "林青", "lin@example.com"),
                request("C03", "周禾", "zhou@example.com"),
                request(" c03 ", "周禾", " ZHOU@example.com ")]
        results, counts = module.allocate_requests(rows, {"mobile-photo": 2, "python-tools": 0})
        equal(outcomes(results), ["accepted", "accepted", "waitlist", "duplicate"], "容量或候补去重规则有误")
        equal(counts, {"mobile-photo": 2, "python-tools": 0}, "counts须包含全部项目")
        zero, zero_counts = module.allocate_requests([request(workshop="python-tools")], {"python-tools": 0})
        equal(outcomes(zero), ["waitlist"], "零容量项目也应候补")
        equal(zero_counts, {"python-tools": 0}, "零容量项目被录取")

    @check("12行样例：逐行结果和三个项目人数")
    def sample():
        folder = Path(__file__).resolve().parent
        rows = read_csv(folder / "requests.csv")
        capacities = {row["workshop"]: int(row["capacity"]) for row in read_csv(folder / "workshop-capacity.csv")}
        results, counts = module.allocate_requests(rows, capacities)
        equal(len(results), 12, "每行都须返回结果")
        equal(outcomes(results), ["accepted", "accepted", "duplicate", "waitlist", "cancelled", "accepted",
                                  "invalid", "invalid", "accepted", "accepted", "waitlist", "accepted"], "样例结果有误")
        equal([row["row_number"] for row in results], list(range(1, 13)), "12行结果的行号或顺序有误")
        equal([row["id"] for row in results], ["r009", "r002", "r009", "r001", "r007", "r004",
                                              "r003", "r010", "r012", "r006", "r011", "r005"], "样例id规范化有误")
        equal(results[2]["email"], "chen@example.com", "重复行的邮箱也应规范化输出")
        equal(results[7]["name"], "", "无效行的姓名也应去两端空白")
        equal(counts, {"mobile-photo": 2, "python-tools": 2, "video-edit": 2}, "样例人数有误")

    @check("命令行：写出分配/项目汇总/总计，输入保持原样")
    def cli_outputs():
        parent = (work_dir or (source.parent / "learner-output" / "checks")).resolve()
        parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="tool-check-", dir=parent) as temporary:
            temporary = Path(temporary)
            requests_path, capacity_path = temporary / "requests.csv", temporary / "capacity.csv"
            rows = [request(), request("B02", "林青", "lin@example.com"), request("C03", status="cancelled")]
            write_csv(requests_path, ["id", "name", "email", "workshop", "status"], rows)
            write_csv(capacity_path, ["workshop", "capacity"], [{"workshop": "mobile-photo", "capacity": 1}])
            original = (requests_path.read_bytes(), capacity_path.read_bytes())
            output = temporary / "output"
            command = [sys.executable, str(source), "--requests", str(requests_path), "--capacities", str(capacity_path), "--output", str(output)]
            finished = subprocess.run(command, text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=15)
            equal(finished.returncode, 0, f"命令行运行失败：{finished.stdout} {finished.stderr}")
            equal(outcomes(read_csv(output / "allocations.csv")), ["accepted", "waitlist", "cancelled"], "分配CSV有误")
            equal(read_csv(output / "summary.csv"), [{"workshop": "mobile-photo", "capacity": "1", "accepted": "1", "waitlist": "1", "remaining": "0"}], "项目汇总有误")
            equal(read_csv(output / "totals.csv"), [{"result": item, "count": count} for item, count in
                                                  [("accepted", "1"), ("waitlist", "1"), ("duplicate", "0"), ("cancelled", "1"), ("invalid", "0")]], "总计有误")
            equal((requests_path.read_bytes(), capacity_path.read_bytes()), original, "不应改写输入CSV")

    passed = 0
    for label, function in checks:
        try:
            function()
        except Exception as error:
            print(f"FAIL {label}\n    {type(error).__name__}: {error}")
        else:
            passed += 1
            print(f"PASS {label}")
    print(f"验收：{passed}/{len(checks)}通过。" + ("可以开始记录这次工作的体验。" if passed == len(checks) else "先看第一项FAIL；未完成模板失败是正常的。"))
    return 0 if passed == len(checks) else 1


def main():
    parser = argparse.ArgumentParser(description="验收学习者文件，默认检查同目录starter.py")
    parser.add_argument("source", nargs="?", type=Path, default=Path(__file__).resolve().parent / "starter.py")
    parser.add_argument("--work-dir", type=Path, help="临时验收目录的父路径")
    args = parser.parse_args()
    return run_checks(args.source, args.work_dir)


if __name__ == "__main__":
    raise SystemExit(main())
